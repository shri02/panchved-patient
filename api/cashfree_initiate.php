<?php
/**
 * Ocayur / Panchved - Cashfree Payment Gateway Initiation Endpoint (Patient Portal)
 * 
 * Supports Packages, Consultations, and Workshops.
 * Creates an order via Cashfree PG Orders API (v2023-08-01) and returns payment_session_id
 * for opening the Cashfree web checkout.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit();
}

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

/**
 * Standardized JSON response helper.
 * CRITICAL: Always return HTTP 200 on Azure App Service / IIS.
 * Azure / IIS intercepts non-200 HTTP status codes (500, 502, 404, 405) and returns an Azure HTML 404 error page,
 * which hides database exception details and JSON error messages.
 */
function sendCashfreeInitResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code(200);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit();
}

// Convert PHP warnings and notices to ErrorException so they don't corrupt JSON output
set_error_handler(function($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

try {
    require_once __DIR__ . '/cashfree_config.php';

    // Handle GET status check (e.g. browser probe)
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $cfg = getCashfreeConfig();
        sendCashfreeInitResponse(true, 'Cashfree Patient Initiate Endpoint is active.', [
            'method' => 'GET',
            'is_configured' => $cfg['is_configured'],
            'environment' => $cfg['mode'],
            'api_version' => $cfg['api_version']
        ], 200);
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        sendCashfreeInitResponse(false, 'Only POST requests are allowed.', [
            'received_method' => $_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN'
        ], 200);
    }

    // Enable strict MySQL reporting so database connection errors throw catchable mysqli_sql_exception
    mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

    // Database connection
    require_once __DIR__ . '/database.php';

    if (!isset($connection1) || !$connection1) {
        if (mysqli_connect_errno()) {
            throw new mysqli_sql_exception(mysqli_connect_error(), mysqli_connect_errno());
        }
        throw new mysqli_sql_exception('MySQL database connection unavailable.', 500);
    }

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (!is_array($input) || empty($input)) {
        $input = $_POST;
    }
    if (!is_array($input)) {
        $input = [];
    }

    $clientOrigin = trim((string)($input['origin_url'] ?? ($input['client_origin'] ?? '')));
    $config = getCashfreeConfig($clientOrigin);

    if (!$config['is_configured']) {
        sendCashfreeInitResponse(false, 'Cashfree credentials not configured. Please ensure CASHFREE_APP_ID and CASHFREE_SECRET_KEY are set in Azure App Service Configuration.', [
            'is_configured' => false,
            'required_variables' => ['CASHFREE_APP_ID', 'CASHFREE_SECRET_KEY', 'CASHFREE_ENV']
        ], 200);
    }

    $serviceType = strtolower(trim((string)($input['service_type'] ?? 'package'))); // 'package', 'workshop', 'consultation'
    $patientName = trim((string)($input['patient_name'] ?? ($_SESSION['full_name'] ?? 'Patient')));
    $patientEmail = trim((string)($input['patient_email'] ?? ($_SESSION['email'] ?? '')));
    $patientPhone = trim((string)($input['patient_phone'] ?? ($_SESSION['phone_number'] ?? '')));
    $patientId = trim((string)($input['patient_id'] ?? ($_SESSION['patient_id'] ?? '')));

    // Clean phone number (Indian 10 digits starting with 6, 7, 8, 9 for Cashfree India)
    $cleanPhone = preg_replace('/[^\d]/', '', (string)$patientPhone);
    if (strlen($cleanPhone) === 12 && substr($cleanPhone, 0, 2) === '91') {
        $cleanPhone = substr($cleanPhone, 2);
    }
    if (strlen($cleanPhone) !== 10 || !preg_match('/^[6-9]\d{9}$/', $cleanPhone)) {
        $cleanPhone = '9876543210';
    }

    $cleanName = preg_replace('/[^a-zA-Z0-9\s.]/', '', $patientName);
    if (empty(trim($cleanName))) {
        $cleanName = 'Patient';
    }

    if (empty($patientEmail) || !filter_var($patientEmail, FILTER_VALIDATE_EMAIL)) {
        $safeId = preg_replace('/[^a-zA-Z0-9]/', '', (string)$patientId);
        $patientEmail = 'patient_' . ($safeId ?: 'user') . '@panchved.com';
    }

    // Resolve service-specific properties
    $amount = 0.00;
    $productInfo = 'Ocayur Healthcare';
    $itemId = '';
    $doctorName = trim((string)($input['doctor_name'] ?? 'Dr. Nidhi Jha'));
    $doctorId = trim((string)($input['doctor_id'] ?? '1'));
    $doctorRole = trim((string)($input['doctor_role'] ?? 'Ayurveda Physician'));
    $appointmentDate = trim((string)($input['appointment_date'] ?? ($input['date'] ?? date('Y-m-d'))));
    $appointmentTime = trim((string)($input['appointment_time'] ?? ($input['time'] ?? '07:00 - 07:45 PM')));
    $agenda = trim((string)($input['agenda'] ?? ''));

    $prefix = 'PKG';
    if ($serviceType === 'workshop') {
        $prefix = 'WKS';
    } elseif ($serviceType === 'consultation') {
        $prefix = 'CNS';
    }

    // Cashfree order_id: max 45 characters, alphanumeric, hyphen, underscore
    $orderId = 'CF_' . $prefix . '_' . date('YmdHis') . '_' . mt_rand(1000, 9999);

    if ($serviceType === 'package' || $serviceType === 'programme') {
        $packageName = trim((string)($input['package_name'] ?? ($input['packageTitle'] ?? 'Health Package')));
        $productInfo = 'Package ' . preg_replace('/[^a-zA-Z0-9\s]/', '', $packageName);
        $itemId = $packageName;
        $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 0.00;

        if ($amount <= 0 && isset($connection1) && $connection1) {
            try {
                $q = @mysqli_prepare($connection1, "SELECT id, price, package_name FROM packages WHERE package_name = ? LIMIT 1");
                if ($q) {
                    @mysqli_stmt_bind_param($q, "s", $packageName);
                    @mysqli_stmt_execute($q);
                    $res = @mysqli_stmt_get_result($q);
                    if ($row = @mysqli_fetch_assoc($res)) {
                        $amount = (float)($row['price'] ?? 0);
                        $itemId = (string)$row['id'];
                    }
                    @mysqli_stmt_close($q);
                }
            } catch (mysqli_sql_exception $e) {
                // Non-fatal fee lookup fallback
            } catch (Throwable $e) {
                // Non-fatal
            }
        }
        if ($amount <= 0) {
            $amount = 999.00;
        }
    } elseif ($serviceType === 'workshop') {
        $wsTitle = trim((string)($input['workshop_title'] ?? ($input['title'] ?? 'Ayurveda Workshop')));
        $productInfo = 'Workshop ' . preg_replace('/[^a-zA-Z0-9\s]/', '', $wsTitle);
        $itemId = trim((string)($input['workshop_id'] ?? ($input['id'] ?? '1')));
        $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 500.00;
    } elseif ($serviceType === 'consultation') {
        $productInfo = 'Consultation ' . preg_replace('/[^a-zA-Z0-9\s]/', '', $doctorName);
        $itemId = 'consultation';
        $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 500.00;
    }

    if ($amount <= 0) {
        $amount = 500.00;
    }
    $formattedAmount = round($amount, 2);

    $cleanCustId = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)$patientId);
    if (empty($cleanCustId) || $cleanCustId === '--') {
        $cleanCustId = 'guest';
    }
    $customerId = substr('pat_' . $cleanCustId . '_' . substr(md5($patientEmail . $cleanPhone), 0, 8), 0, 45);
    $orderNote = substr(preg_replace('/[^a-zA-Z0-9\s_\-]/', '', $productInfo), 0, 75);

    // Cashfree order_meta: notify_url must be HTTPS URL; omit if HTTP/localhost
    $orderMeta = [
        'return_url' => $config['callback_url'] . '?order_id={order_id}'
    ];
    if (!empty($config['notify_url']) && strpos($config['notify_url'], 'https://') === 0 && strpos($config['notify_url'], 'localhost') === false) {
        $orderMeta['notify_url'] = $config['notify_url'];
    }

    // Cashfree requires all order_tags values to be non-empty strings (max 100 chars)
    $orderTags = [
        'service_type' => substr((string)($serviceType ?: 'package'), 0, 40),
        'item_id' => substr((string)($itemId ?: '1'), 0, 40),
        'patient_id' => substr((string)($patientId ?: '1'), 0, 40),
        'doctor_name' => substr((string)($doctorName ?: 'Doctor'), 0, 40)
    ];

    // Build Cashfree API request payload
    $orderPayload = [
        'order_id' => $orderId,
        'order_amount' => $formattedAmount,
        'order_currency' => 'INR',
        'customer_details' => [
            'customer_id' => $customerId,
            'customer_name' => substr($cleanName, 0, 50),
            'customer_email' => $patientEmail,
            'customer_phone' => $cleanPhone
        ],
        'order_meta' => $orderMeta,
        'order_note' => $orderNote,
        'order_tags' => $orderTags
    ];

    // Call Cashfree API to create the order
    $apiResult = cashfreeApiCall('/orders', 'POST', $orderPayload, $config);

    if (!$apiResult['success']) {
        $errorMsg = $apiResult['error'];
        $details = $apiResult['data'];
        if (is_array($details) && !empty($details['message'])) {
            $errorMsg = $details['message'];
        }
        sendCashfreeInitResponse(false, 'Cashfree Order Creation Failed: ' . $errorMsg, [
            'api_error' => $errorMsg,
            'api_response' => $details,
            'http_code' => $apiResult['http_code']
        ], 200);
    }

    $resData = $apiResult['data'];
    $paymentSessionId = $resData['payment_session_id'] ?? '';

    if (empty($paymentSessionId)) {
        sendCashfreeInitResponse(false, 'Cashfree did not return a payment_session_id.', [
            'api_response' => $resData
        ], 200);
    }

    // Pre-record in transactions table if available
    if (isset($connection1) && $connection1) {
        try {
            $ins = @mysqli_prepare($connection1, "INSERT INTO `payu_transactions` 
                (`txnid`, `service_type`, `item_id`, `item_title`, `patient_name`, `patient_email`, `patient_phone`, `amount`, `payment_method`, `payment_status`, `created_at`)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Cashfree', 'Pending', NOW())
                ON DUPLICATE KEY UPDATE `payment_status` = 'Pending', `amount` = VALUES(`amount`), `payment_method` = 'Cashfree'");
            if ($ins) {
                $amtVal = floatval($formattedAmount);
                $itIdStr = (string)$itemId;
                @mysqli_stmt_bind_param($ins, "sssssssd",
                    $orderId, $serviceType, $itIdStr, $orderNote, $cleanName, $patientEmail, $cleanPhone, $amtVal
                );
                @mysqli_stmt_execute($ins);
                @mysqli_stmt_close($ins);
            }
        } catch (mysqli_sql_exception $e) {
            // Non-fatal
        } catch (Throwable $txErr) {
            // Non-fatal
        }
    }

    // Save pending state in session
    $_SESSION['last_cashfree_order_id'] = $orderId;
    if (!isset($_SESSION['cashfree_pending']) || !is_array($_SESSION['cashfree_pending'])) {
        $_SESSION['cashfree_pending'] = [];
    }
    $_SESSION['cashfree_pending'][$orderId] = [
        'service_type' => $serviceType,
        'item_id' => $itemId,
        'item_title' => $orderNote,
        'patient_id' => $patientId,
        'patient_name' => $cleanName,
        'patient_email' => $patientEmail,
        'patient_phone' => $cleanPhone,
        'amount' => $formattedAmount,
        'doctor_name' => $doctorName,
        'doctor_id' => $doctorId,
        'doctor_role' => $doctorRole,
        'appointment_date' => $appointmentDate,
        'appointment_time' => $appointmentTime,
        'agenda' => $agenda,
        'payment_session_id' => $paymentSessionId
    ];

    sendCashfreeInitResponse(true, 'Payment initiated successfully.', [
        'payment_session_id' => $paymentSessionId,
        'order_id' => $orderId,
        'cf_environment' => $config['mode'],
        'amount' => $formattedAmount,
        'return_url' => $config['callback_url'] . '?order_id=' . urlencode($orderId)
    ], 200);

} catch (mysqli_sql_exception $e) {
    sendCashfreeInitResponse(false, 'Database Error: ' . $e->getMessage(), [
        'error_type' => 'mysqli_sql_exception',
        'sqlstate' => method_exists($e, 'getSqlState') ? $e->getSqlState() : null,
        'error_code' => $e->getCode(),
        'error_details' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 200);
} catch (Throwable $e) {
    sendCashfreeInitResponse(false, 'Server Error: ' . $e->getMessage(), [
        'error_type' => get_class($e),
        'error_code' => $e->getCode(),
        'error_details' => $e->getMessage(),
        'file' => basename($e->getFile()),
        'line' => $e->getLine()
    ], 200);
}
