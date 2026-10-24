<?php
/**
 * Ocayur / Panchved - PayU Payment Gateway Initiation Endpoint
 * 
 * Prepares the PayU Hosted Checkout parameters & SHA-512 hash.
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

function sendInitiateResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendInitiateResponse(false, 'Only POST requests are allowed.', [], 405);
}

$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST;
}

$clientOrigin = trim((string)($input['origin_url'] ?? ($input['client_origin'] ?? '')));
$config = getPayUConfig($clientOrigin);

if (!$config['is_configured']) {
    sendInitiateResponse(false, 'PayU credentials not found. Please ensure PAYU_MERCHANT_KEY and PAYU_SALT are set in Azure App Service Configuration.', [
        'is_configured' => false
    ], 500);
}

$serviceType = strtolower(trim((string)($input['service_type'] ?? 'package'))); // 'package', 'workshop', 'consultation'
$patientName = trim((string)($input['patient_name'] ?? ($_SESSION['full_name'] ?? 'Patient')));
$patientEmail = trim((string)($input['patient_email'] ?? ($_SESSION['email'] ?? '')));
$patientPhone = trim((string)($input['patient_phone'] ?? ($_SESSION['phone_number'] ?? '')));
$patientId = trim((string)($input['patient_id'] ?? ($_SESSION['patient_id'] ?? '')));

// Clean first name (PayU strictly requires letters only for firstname)
$nameParts = preg_split('/\s+/', trim($patientName));
$firstName = !empty($nameParts[0]) ? preg_replace('/[^a-zA-Z]/', '', $nameParts[0]) : 'Patient';
if (empty($firstName)) {
    $firstName = 'Patient';
}

// Clean phone digits
$cleanPhone = preg_replace('/[^\d]/', '', $patientPhone);
if (strlen($cleanPhone) === 12 && substr($cleanPhone, 0, 2) === '91') {
    $cleanPhone = substr($cleanPhone, 2);
}

// Product info & items
$amount = 0.00;
$productInfo = 'Ocayur Healthcare';
$itemId = '';
$doctorName = trim((string)($input['doctor_name'] ?? 'Dr. Nidhi Jha'));
$doctorRole = trim((string)($input['doctor_role'] ?? 'Ayurveda Physician'));
$appointmentDate = trim((string)($input['appointment_date'] ?? ($input['date'] ?? date('Y-m-d'))));
$appointmentTime = trim((string)($input['appointment_time'] ?? ($input['time'] ?? '07:00 - 07:45 PM')));
$agenda = trim((string)($input['agenda'] ?? ''));

// Service prefix for transaction ID
$prefix = 'PKG';
if ($serviceType === 'workshop') {
    $prefix = 'WKS';
} elseif ($serviceType === 'consultation') {
    $prefix = 'CNS';
}
$txnid = 'TXN_' . $prefix . '_' . date('YmdHis') . '_' . mt_rand(1000, 9999);

// Resolve details by service
if ($serviceType === 'package' || $serviceType === 'programme') {
    $packageName = trim((string)($input['package_name'] ?? ($input['packageTitle'] ?? 'Health Package')));
    $productInfo = 'Package ' . preg_replace('/[^a-zA-Z0-9\s]/', '', $packageName);
    $itemId = $packageName;
    $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 0.00;

    // Check price in database if not sent or 0
    if ($amount <= 0 && $connection1) {
        $q = mysqli_prepare($connection1, "SELECT id, price, package_name FROM packages WHERE package_name = ? LIMIT 1");
        if ($q) {
            mysqli_stmt_bind_param($q, "s", $packageName);
            mysqli_stmt_execute($q);
            $res = mysqli_stmt_get_result($q);
            if ($row = mysqli_fetch_assoc($res)) {
                $amount = (float)($row['price'] ?? 0);
                $itemId = (string)$row['id'];
            }
            mysqli_stmt_close($q);
        }
    }
} elseif ($serviceType === 'workshop') {
    $wsTitle = trim((string)($input['workshop_title'] ?? ($input['title'] ?? 'Workshop')));
    $productInfo = 'Workshop ' . preg_replace('/[^a-zA-Z0-9\s]/', '', $wsTitle);
    $itemId = trim((string)($input['workshop_id'] ?? ($input['id'] ?? '')));
    $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 0.00;
} elseif ($serviceType === 'consultation') {
    $productInfo = 'Consultation ' . preg_replace('/[^a-zA-Z0-9\s]/', '', $doctorName);
    $itemId = 'consultation';
    $amount = isset($input['amount']) && is_numeric($input['amount']) ? (float)$input['amount'] : 500.00;
}

if ($amount <= 0) {
    sendInitiateResponse(false, 'Invalid payment amount specified.', [], 400);
}

// Clean productInfo for PayU (max 100 characters, no special chars)
$productInfo = trim(substr(preg_replace('/[^a-zA-Z0-9\s_\-]/', '', $productInfo), 0, 95));
if (empty($productInfo)) {
    $productInfo = 'Healthcare Service';
}

$formattedAmount = sprintf("%.2f", $amount);

// Prepare UDF parameters
$udf1 = $serviceType;
$udf2 = $itemId;
$udf3 = $patientId;
$udf4 = $doctorName;
$metaJson = json_encode([
    'date' => $appointmentDate,
    'time' => $appointmentTime,
    'agenda' => $agenda,
    'doc_role' => $doctorRole
]);
$udf5 = $metaJson;

// Pre-record in payu_transactions table if available
if ($connection1) {
    $ins = mysqli_prepare($connection1, "INSERT INTO `payu_transactions` 
        (`txnid`, `service_type`, `item_id`, `item_title`, `patient_name`, `patient_email`, `patient_phone`, `amount`, `payment_method`, `payment_status`, `created_at`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PayU', 'Pending', NOW())
        ON DUPLICATE KEY UPDATE `payment_status` = 'Pending', `amount` = VALUES(`amount`)");
    if ($ins) {
        $amtVal = floatval($formattedAmount);
        mysqli_stmt_bind_param($ins, "sssssssd",
            $txnid, $serviceType, $itemId, $productInfo, $patientName, $patientEmail, $cleanPhone, $amtVal
        );
        mysqli_stmt_execute($ins);
        mysqli_stmt_close($ins);
    }
}

// Save pending state in session
$_SESSION['last_payu_txnid'] = $txnid;
if (!isset($_SESSION['payu_pending']) || !is_array($_SESSION['payu_pending'])) {
    $_SESSION['payu_pending'] = [];
}
$_SESSION['payu_pending'][$txnid] = [
    'service_type' => $serviceType,
    'item_id' => $itemId,
    'item_title' => $productInfo,
    'patient_id' => $patientId,
    'patient_name' => $patientName,
    'patient_email' => $patientEmail,
    'patient_phone' => $cleanPhone,
    'amount' => $formattedAmount,
    'doctor_name' => $doctorName,
    'doctor_role' => $doctorRole,
    'appointment_date' => $appointmentDate,
    'appointment_time' => $appointmentTime,
    'agenda' => $agenda
];

// Calculate hash
$hashParams = [
    'key' => $config['merchant_key'],
    'txnid' => $txnid,
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
$hash = generatePayUHash($hashParams, $config['salt']);

// Build payload parameters to POST to PayU
$payuPayload = [
    'key' => $config['merchant_key'],
    'txnid' => $txnid,
    'amount' => $formattedAmount,
    'productinfo' => $productInfo,
    'firstname' => $firstName,
    'email' => $patientEmail,
    'phone' => $cleanPhone,
    'surl' => $config['success_url'],
    'furl' => $config['failure_url'],
    'hash' => $hash,
    'udf1' => $udf1,
    'udf2' => $udf2,
    'udf3' => $udf3,
    'udf4' => $udf4,
    'udf5' => $udf5
];

sendInitiateResponse(true, 'Payment initiated successfully.', [
    'action_url' => $config['endpoint'],
    'txnid' => $txnid,
    'params' => $payuPayload
]);
