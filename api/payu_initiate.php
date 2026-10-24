<?php
/**
 * Ocayur / Panchved - PayU Payment Initiation Endpoint
 * 
 * Handles payment checkout preparation for:
 * 1. Packages / Programmes
 * 2. Workshops / Courses
 * 3. Consultations
 * 
 * Returns the PayU Hosted Checkout payload with calculated SHA-512 hash
 * ready for auto-submitting the payment form.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/payu_config.php';

function sendPayUResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data));
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendPayUResponse(false, 'Only POST requests are allowed.', [], 405);
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST;
}

$serviceType = strtolower(trim((string)($input['service_type'] ?? 'package'))); // 'package', 'workshop', 'consultation'
$patientName = trim((string)($input['patient_name'] ?? $_SESSION['full_name'] ?? 'Patient'));
$patientEmail = trim((string)($input['patient_email'] ?? $_SESSION['email'] ?? ''));
$patientPhone = trim((string)($input['patient_phone'] ?? $_SESSION['phone_number'] ?? ''));
$patientId = trim((string)($input['patient_id'] ?? $_SESSION['patient_id'] ?? ''));

$cleanPhone = preg_replace('/[^\d]/', '', $patientPhone);
if (strlen($cleanPhone) === 12 && substr($cleanPhone, 0, 2) === '91') {
    $cleanPhone = substr($cleanPhone, 2);
}

$clientOrigin = trim((string)($input['origin_url'] ?? ($input['client_origin'] ?? '')));
$config = getPayUConfig($clientOrigin);

// Clean first name for PayU
$nameParts = preg_split('/\s+/', trim($patientName));
$firstName = !empty($nameParts[0]) ? preg_replace('/[^a-zA-Z]/', '', $nameParts[0]) : 'Patient';
if (empty($firstName)) $firstName = 'Patient';

// Generate unique transaction ID: PAYU_<SERVICE_SHORT>_<TIMESTAMP>_<RAND>
$servicePrefix = 'PKG';
if ($serviceType === 'workshop') $servicePrefix = 'WKS';
if ($serviceType === 'consultation') $servicePrefix = 'CNS';
$txnId = 'TXN_' . $servicePrefix . '_' . date('YmdHis') . '_' . rand(1000, 9999);

$amount = 0.00;
$productInfo = '';
$itemId = '';
$doctorName = trim((string)($input['doctor_name'] ?? 'Dr. Nidhi Jha'));
$doctorRole = trim((string)($input['doctor_role'] ?? 'Ayurveda Physician'));
$appointmentDate = trim((string)($input['appointment_date'] ?? $input['date'] ?? date('Y-m-d')));
$appointmentTime = trim((string)($input['appointment_time'] ?? $input['time'] ?? '07:00 - 07:45 PM'));
$agenda = trim((string)($input['agenda'] ?? ''));

// ============================================================================
// Service-Specific Validations & Amount Calculations
// ============================================================================
if ($serviceType === 'package' || $serviceType === 'programme') {
    $packageName = trim((string)($input['package_name'] ?? $input['packageTitle'] ?? 'Gut Healing Package'));
    $productInfo = 'Package: ' . $packageName;
    $itemId = $packageName;

    // Check price in DB
    $pkgQuery = "SELECT id, price, package_name FROM packages WHERE package_name = ? OR package_name LIKE ? LIMIT 1";
    if ($stmt = mysqli_prepare($connection1, $pkgQuery)) {
        $likeName = '%' . $packageName . '%';
        mysqli_stmt_bind_param($stmt, "ss", $packageName, $likeName);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        if ($pkgRow = mysqli_fetch_assoc($res)) {
            $amount = (float)($pkgRow['price'] ?? 0);
            $packageName = $pkgRow['package_name'];
            $itemId = (string)$pkgRow['id'];
        }
        mysqli_stmt_close($stmt);
    }

    if ($amount <= 0 && isset($input['amount']) && is_numeric($input['amount'])) {
        $amount = (float)$input['amount'];
    }
    if ($amount <= 0) {
        $amount = 7999.00;
    }

    // Check if patient is already enrolled in this package
    $checkSql = "SELECT id, booking_id FROM patient_packages 
                 WHERE (patient_phone != '' AND (patient_phone = ? OR patient_phone = ?)) 
                   AND (package_name = ? OR package_name LIKE ?) 
                   AND status != 'Cancelled' LIMIT 1";
    if ($chkStmt = mysqli_prepare($connection1, $checkSql)) {
        $pkgLike = '%' . $packageName . '%';
        mysqli_stmt_bind_param($chkStmt, "ssss", $patientPhone, $cleanPhone, $packageName, $pkgLike);
        mysqli_stmt_execute($chkStmt);
        $chkRes = mysqli_stmt_get_result($chkStmt);
        if ($chkRow = mysqli_fetch_assoc($chkRes)) {
            mysqli_stmt_close($chkStmt);
            sendPayUResponse(false, "You are already enrolled in {$packageName}.", [
                'already_enrolled' => true,
                'package_name' => $packageName,
                'booking_id' => $chkRow['booking_id']
            ], 400);
        }
        mysqli_stmt_close($chkStmt);
    }

} elseif ($serviceType === 'workshop') {
    $workshopId = trim((string)($input['workshop_id'] ?? $input['id'] ?? '1'));
    $workshopTitle = trim((string)($input['workshop_title'] ?? $input['title'] ?? 'Ayurveda Workshop'));
    $productInfo = 'Workshop: ' . $workshopTitle;
    $itemId = $workshopId;

    $wsQuery = "SELECT id, fee, price, title FROM workshops WHERE id = ? OR workshop_id = ? OR title = ? LIMIT 1";
    if ($stmt = mysqli_prepare($connection1, $wsQuery)) {
        $wsInt = intval($workshopId);
        mysqli_stmt_bind_param($stmt, "iss", $wsInt, $workshopId, $workshopTitle);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        if ($wsRow = mysqli_fetch_assoc($res)) {
            $amount = (float)($wsRow['fee'] > 0 ? $wsRow['fee'] : ($wsRow['price'] ?? 0));
            $workshopTitle = $wsRow['title'];
            $itemId = (string)$wsRow['id'];
        }
        mysqli_stmt_close($stmt);
    }

    if ($amount <= 0 && isset($input['amount']) && is_numeric($input['amount'])) {
        $amount = (float)$input['amount'];
    }
    if ($amount <= 0) {
        $amount = 799.00;
    }

    // Check if already registered
    $wsNumericId = intval($itemId);
    $chkQuery = "SELECT id, booking_id FROM `workshop_bookings` 
                 WHERE (workshop_id = ? OR workshop_id = ?) 
                   AND (doctor_phone != '' AND (doctor_phone = ? OR doctor_phone = ?)) 
                   AND payment_status = 'Success' LIMIT 1";
    if ($chkStmt = mysqli_prepare($connection1, $chkQuery)) {
        mysqli_stmt_bind_param($chkStmt, "iiss", $wsNumericId, $workshopId, $patientPhone, $cleanPhone);
        mysqli_stmt_execute($chkStmt);
        $chkRes = mysqli_stmt_get_result($chkStmt);
        if ($chkRow = mysqli_fetch_assoc($chkRes)) {
            mysqli_stmt_close($chkStmt);
            sendPayUResponse(false, "You are already registered for this workshop.", [
                'already_registered' => true,
                'booking_id' => $chkRow['booking_id']
            ], 400);
        }
        mysqli_stmt_close($chkStmt);
    }

} elseif ($serviceType === 'consultation') {
    $productInfo = 'Consultation with ' . $doctorName;
    $itemId = 'CONSULT_' . date('Ymd');
    $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 500.00;
} else {
    $productInfo = 'Ocayur Healthcare Service';
    $itemId = 'SERVICE';
    $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 500.00;
}

// Format amount to standard 2 decimal places
$formattedAmount = sprintf("%.2f", $amount);

// Metadata packaged into UDFs (User Defined Fields for PayU)
// PayU provides udf1 through udf5
$udf1 = $serviceType;
$udf2 = substr($itemId, 0, 50);
$udf3 = substr($patientId ?: ($patientPhone ?: 'PATIENT'), 0, 50);
$udf4 = substr($doctorName, 0, 50);
$udf5 = json_encode([
    'date' => $appointmentDate,
    'time' => $appointmentTime,
    'item_name' => substr($productInfo, 0, 100),
    'agenda' => substr($agenda, 0, 100)
]);

// If PayU is NOT configured in environment variables, inform user
if (!$config['is_configured']) {
    sendPayUResponse(false, 'PayU credentials are not configured in App Service environment variables. Please add PAYU_MERCHANT_KEY and PAYU_SALT.', [
        'payu_configured' => false,
        'environment_keys_needed' => [
            'PAYU_MERCHANT_KEY' => 'Your PayU Merchant Key',
            'PAYU_SALT' => 'Your PayU Merchant Salt',
            'PAYU_ENV' => 'test or prod'
        ],
        'details' => [
            'service_type' => $serviceType,
            'amount' => $formattedAmount,
            'product_info' => $productInfo,
            'patient_name' => $patientName,
            'patient_email' => $patientEmail,
            'patient_phone' => $patientPhone
        ]
    ], 200);
}

// Generate Hash
$hashParams = [
    'key' => $config['merchant_key'],
    'txnid' => $txnId,
    'amount' => $formattedAmount,
    'productinfo' => $productInfo,
    'firstname' => $firstName,
    'email' => $patientEmail,
    'udf1' => $udf1,
    'udf2' => $udf2,
    'udf3' => $udf3,
    'udf4' => $udf4,
    'udf5' => $udf5
];

$payuHash = generatePayUHash($hashParams, $config['salt']);

// Save pending transaction state in PHP session for reliable fulfillment
$_SESSION['last_payu_txnid'] = $txnId;
if (!isset($_SESSION['payu_pending']) || !is_array($_SESSION['payu_pending'])) {
    $_SESSION['payu_pending'] = [];
}
$_SESSION['payu_pending'][$txnId] = [
    'service_type' => $serviceType,
    'item_id' => $itemId,
    'item_title' => $productInfo,
    'package_name' => $packageName ?? '',
    'workshop_id' => $workshopId ?? '',
    'patient_id' => $patientId,
    'patient_name' => $patientName,
    'patient_email' => $patientEmail,
    'patient_phone' => $patientPhone,
    'amount' => $amount,
    'doctor_name' => $doctorName,
    'doctor_role' => $doctorRole,
    'appointment_date' => $appointmentDate,
    'appointment_time' => $appointmentTime,
    'agenda' => $agenda,
    'created_at' => date('Y-m-d H:i:s')
];

// Pre-record pending transaction in database if table exists
if ($connection1) {
    $insTx = mysqli_prepare($connection1, "INSERT INTO `payu_transactions` 
        (`txnid`, `service_type`, `item_id`, `item_title`, `patient_name`, `patient_email`, `patient_phone`, `amount`, `payment_method`, `payment_status`, `created_at`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PayU', 'Pending', NOW())
        ON DUPLICATE KEY UPDATE `payment_status` = 'Pending'");
    if ($insTx) {
        $amtVal = floatval($amount);
        mysqli_stmt_bind_param($insTx, "sssssssd", 
            $txnId, $serviceType, $itemId, $productInfo, $patientName, $patientEmail, $patientPhone, $amtVal
        );
        mysqli_stmt_execute($insTx);
        mysqli_stmt_close($insTx);
    }
}

// Append callback parameters to ensure txnid and serviceType are preserved across redirects
$cbParams = http_build_query([
    'txnid' => $txnId,
    'service' => $serviceType,
    'amt' => $formattedAmount
]);
$surlWithParams = $config['success_url'] . (strpos($config['success_url'], '?') === false ? '?' : '&') . $cbParams;
$furlWithParams = $config['failure_url'] . (strpos($config['failure_url'], '?') === false ? '?' : '&') . $cbParams;

// Build Form Fields for submission to PayU
$payuPayload = [
    'key' => $config['merchant_key'],
    'txnid' => $txnId,
    'amount' => $formattedAmount,
    'productinfo' => $productInfo,
    'firstname' => $firstName,
    'email' => $patientEmail,
    'phone' => $patientPhone,
    'surl' => $surlWithParams,
    'furl' => $furlWithParams,
    'hash' => $payuHash,
    'service_provider' => 'payu_paisa',
    'udf1' => $udf1,
    'udf2' => $udf2,
    'udf3' => $udf3,
    'udf4' => $udf4,
    'udf5' => $udf5
];

sendPayUResponse(true, 'PayU payment session initialized successfully.', [
    'payu_configured' => true,
    'action_url' => $config['endpoint'],
    'txnid' => $txnId,
    'amount' => $formattedAmount,
    'productinfo' => $productInfo,
    'mode' => $config['mode'],
    'params' => $payuPayload
], 200);
