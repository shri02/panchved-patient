<?php
/**
 * Ocayur / Panchved - Cashfree Payment Response & Return Handler (Patient Portal)
 * 
 * Receives the redirect from Cashfree with order_id in query parameter:
 * ?order_id={order_id}
 * 
 * Performs secure server-to-server verification with Cashfree API,
 * records payment details, fulfills package / consultation / workshop booking in MySQL, and shows confirmation.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/cashfree_config.php';
require_once __DIR__ . '/activity_logger.php';

// Convert PHP warnings and notices to ErrorException so they don't break execution, while ignoring deprecation notices
set_error_handler(function($severity, $message, $file, $line) {
    if ($severity === E_DEPRECATED || $severity === E_USER_DEPRECATED) {
        return false;
    }
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

$orderId = trim((string)($_GET['order_id'] ?? ($_POST['order_id'] ?? ($_SESSION['last_cashfree_order_id'] ?? ''))));
$config = getCashfreeConfig();

$pending = $_SESSION['cashfree_pending'][$orderId] ?? null;

$isSimulation = (!$config['is_live'] && isset($_GET['simulate_success']) && $_GET['simulate_success'] == '1');

$orderStatus = 'PENDING';
$cfPaymentId = '';
$bankRefNum = '';
$paymentMethod = 'Cashfree';
$errorMsg = '';
$cfOrderData = null;

// Query Cashfree API for authoritative order status
if (!empty($orderId) && $config['is_configured']) {
    $orderCheck = cashfreeApiCall('/orders/' . urlencode($orderId), 'GET', null, $config);
    if ($orderCheck['success'] && is_array($orderCheck['data'])) {
        $cfOrderData = $orderCheck['data'];
        $orderStatus = strtoupper(trim((string)($cfOrderData['order_status'] ?? 'PENDING')));
    } else {
        $errorMsg = $orderCheck['error'] ?: 'Could not verify order with Cashfree.';
    }

    // Check payment attempts
    $paymentsCheck = cashfreeApiCall('/orders/' . urlencode($orderId) . '/payments', 'GET', null, $config);
    if ($paymentsCheck['success'] && is_array($paymentsCheck['data']) && !empty($paymentsCheck['data'])) {
        foreach ($paymentsCheck['data'] as $pItem) {
            $pStatus = strtoupper(trim((string)($pItem['payment_status'] ?? '')));
            if ($pStatus === 'SUCCESS') {
                $cfPaymentId = (string)($pItem['cf_payment_id'] ?? '');
                $bankRefNum = (string)($pItem['bank_reference'] ?? '');
                $orderStatus = 'PAID';
                break;
            } elseif (empty($cfPaymentId)) {
                $cfPaymentId = (string)($pItem['cf_payment_id'] ?? '');
                $bankRefNum = (string)($pItem['bank_reference'] ?? '');
                $errorMsg = (string)($pItem['payment_message'] ?? $errorMsg);
            }
        }
    }
}

if ($isSimulation) {
    $orderStatus = 'PAID';
    $cfPaymentId = 'SIM_CF_' . time();
    $bankRefNum = 'SIM_REF_' . mt_rand(100000, 999999);
}

$isSuccess = ($orderStatus === 'PAID');

// Resolve parameters from Cashfree order data or session pending
$amount = floatval($cfOrderData['order_amount'] ?? ($pending['amount'] ?? 0.00));
$productInfo = $pending['item_title'] ?? ($cfOrderData['order_note'] ?? 'Healthcare Service');
$firstName = $pending['patient_name'] ?? ($cfOrderData['customer_details']['customer_name'] ?? 'Patient');
$email = $pending['patient_email'] ?? ($cfOrderData['customer_details']['customer_email'] ?? '');
$phone = $pending['patient_phone'] ?? ($cfOrderData['customer_details']['customer_phone'] ?? '');

$serviceType = strtolower(trim((string)($pending['service_type'] ?? ($cfOrderData['order_tags']['service_type'] ?? 'package'))));
$itemId = $pending['item_id'] ?? ($cfOrderData['order_tags']['item_id'] ?? '');
$patientId = $pending['patient_id'] ?? ($cfOrderData['order_tags']['patient_id'] ?? '');
$doctorName = $pending['doctor_name'] ?? ($cfOrderData['order_tags']['doctor_name'] ?? 'Dr. Nidhi Jha');

$bookingId = '#' . mt_rand(100000, 999999);
$appointmentCode = 'APT-' . date('Ymd') . '-' . mt_rand(100, 999);
$formattedAmount = '₹' . number_format($amount > 0 ? $amount : 0.00, 2);

$rawApptDate = $pending['appointment_date'] ?? date('Y-m-d');
$apptDate = date('Y-m-d');
if (!empty($rawApptDate)) {
    $parsedDate = strtotime($rawApptDate);
    if ($parsedDate !== false) {
        $apptDate = date('Y-m-d', $parsedDate);
    }
}
$displayApptDate = (!empty($rawApptDate) && strtotime($rawApptDate) !== false) ? date('j F Y', strtotime($rawApptDate)) : $rawApptDate;
$apptTime = $pending['appointment_time'] ?? '07:00 - 07:45 PM';

// Update payu_transactions table with Cashfree transaction
if (isset($connection1) && $connection1 && !empty($orderId)) {
    try {
        $insTx = @mysqli_prepare($connection1, "INSERT INTO `payu_transactions` 
            (`txnid`, `mihpayid`, `service_type`, `item_id`, `item_title`, `patient_name`, `patient_email`, `patient_phone`, `amount`, `payment_method`, `payment_status`, `bank_ref_num`, `raw_response`, `created_at`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Cashfree', ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                `mihpayid` = VALUES(`mihpayid`),
                `payment_status` = VALUES(`payment_status`),
                `bank_ref_num` = VALUES(`bank_ref_num`),
                `raw_response` = VALUES(`raw_response`),
                `payment_method` = 'Cashfree'");
        if ($insTx) {
            $pStatus = $isSuccess ? 'Success' : 'Failed';
            $rawJson = json_encode($cfOrderData ?: ['order_id' => $orderId, 'status' => $orderStatus]);
            $amtVal = floatval($amount);
            $itIdStr = (string)$itemId;
            @mysqli_stmt_bind_param($insTx, "ssssssssdsss", 
                $orderId, $cfPaymentId, $serviceType, $itIdStr, $productInfo, $firstName, $email, $phone, $amtVal, $pStatus, $bankRefNum, $rawJson
            );
            @mysqli_stmt_execute($insTx);
            @mysqli_stmt_close($insTx);
        }

        recordActivity(
            $connection1,
            'Billing',
            $isSuccess ? 'payment.success' : 'payment.failed',
            ($isSuccess ? 'Payment received' : 'Payment failed') . " for {$productInfo} (Amount: ₹" . number_format($amount, 2) . ", Order: {$orderId})",
            ucfirst($serviceType),
            intval($itemId) ?: null,
            $productInfo,
            [
                'order_id' => $orderId,
                'cf_payment_id' => $cfPaymentId,
                'amount' => $amount,
                'status' => $pStatus,
                'service_type' => $serviceType,
                'gateway' => 'Cashfree',
                'product' => $productInfo,
                'patient_name' => $firstName,
                'email' => $email,
                'phone' => $phone
            ],
            'Patient',
            intval($patientId) ?: null,
            $firstName
        );
    } catch (mysqli_sql_exception $txErr) {
        error_log('Cashfree Txn Log DB Error: ' . $txErr->getMessage());
    } catch (Throwable $txErr) {
        error_log('Cashfree Txn Log Error: ' . $txErr->getMessage());
    }
}

// DB Booking Fulfillment on Success
if ($isSuccess && isset($connection1) && $connection1) {
    try {
        $cleanPhone = preg_replace('/[^\d]/', '', $phone);
        if (strlen($cleanPhone) === 12 && substr($cleanPhone, 0, 2) === '91') {
            $cleanPhone = substr($cleanPhone, 2);
        }

        // Resolve Patient ID & Full Name
        $patientDbId = (int)$patientId;
        $patientFullName = !empty($pending['patient_name']) ? $pending['patient_name'] : $firstName;

        if ($patientDbId > 0) {
            $pQuery = "SELECT id, full_name FROM patients WHERE id = ? LIMIT 1";
            if ($pStmt = @mysqli_prepare($connection1, $pQuery)) {
                @mysqli_stmt_bind_param($pStmt, "i", $patientDbId);
                @mysqli_stmt_execute($pStmt);
                $pRes = @mysqli_stmt_get_result($pStmt);
                if ($pRow = @mysqli_fetch_assoc($pRes)) {
                    if (!empty($pRow['full_name'])) {
                        $patientFullName = $pRow['full_name'];
                    }
                }
                @mysqli_stmt_close($pStmt);
            }
        } else {
            $pQuery = "SELECT id, full_name FROM patients WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) OR (email != '' AND email = ?) LIMIT 1";
            if ($pStmt = @mysqli_prepare($connection1, $pQuery)) {
                @mysqli_stmt_bind_param($pStmt, "sss", $phone, $cleanPhone, $email);
                @mysqli_stmt_execute($pStmt);
                $pRes = @mysqli_stmt_get_result($pStmt);
                if ($pRow = @mysqli_fetch_assoc($pRes)) {
                    $patientDbId = (int)$pRow['id'];
                    if (!empty($pRow['full_name'])) {
                        $patientFullName = $pRow['full_name'];
                    }
                }
                @mysqli_stmt_close($pStmt);
            }
        }

        // Resolve Doctor ID & Exact Name
        $doctorDbId = isset($pending['doctor_id']) && intval($pending['doctor_id']) > 0 ? intval($pending['doctor_id']) : 0;
        if ($doctorDbId > 0) {
            $dStmt = @mysqli_prepare($connection1, "SELECT id, full_name FROM doctors WHERE id = ? LIMIT 1");
            if ($dStmt) {
                @mysqli_stmt_bind_param($dStmt, "i", $doctorDbId);
                @mysqli_stmt_execute($dStmt);
                $dRes = @mysqli_stmt_get_result($dStmt);
                if ($dRow = @mysqli_fetch_assoc($dRes)) {
                    $doctorName = $dRow['full_name'];
                }
                @mysqli_stmt_close($dStmt);
            }
        }
        if ($doctorDbId <= 0) {
            $cleanDocSearch = trim(preg_replace('/\s+/', ' ', preg_replace('/^dr\.?\s+/i', '', $doctorName)));
            $docLike = '%' . $cleanDocSearch . '%';
            $dQuery = "SELECT id, full_name FROM doctors WHERE full_name = ? OR full_name LIKE ? OR REPLACE(full_name, '  ', ' ') LIKE ? LIMIT 1";
            if ($dStmt = @mysqli_prepare($connection1, $dQuery)) {
                @mysqli_stmt_bind_param($dStmt, "sss", $doctorName, $docLike, $docLike);
                @mysqli_stmt_execute($dStmt);
                $dRes = @mysqli_stmt_get_result($dStmt);
                if ($dRow = @mysqli_fetch_assoc($dRes)) {
                    $doctorDbId = (int)$dRow['id'];
                    $doctorName = $dRow['full_name'];
                }
                @mysqli_stmt_close($dStmt);
            }
            if ($doctorDbId <= 0) {
                $doctorDbId = 1;
            }
        }

        // A. Package Fulfillment
        if ($serviceType === 'package' || $serviceType === 'programme') {
            $cleanPkgName = trim(str_ireplace('Package:', '', $productInfo));
            if (empty($cleanPkgName)) {
                $cleanPkgName = 'Health Package';
            }

            $insPpkg = @mysqli_prepare($connection1, "INSERT INTO patient_packages 
                (booking_id, patient_id, patient_phone, package_name, doctor_id, doctor_name, price, booking_date, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'Active', NOW(), NOW())");
            if ($insPpkg) {
                @mysqli_stmt_bind_param($insPpkg, "sissisd", $bookingId, $patientDbId, $phone, $cleanPkgName, $doctorDbId, $doctorName, $amount);
                @mysqli_stmt_execute($insPpkg);
                @mysqli_stmt_close($insPpkg);
            }

            $insAppt = @mysqli_prepare($connection1, "INSERT INTO appointments 
                (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, '45 min', 'Package Consultation', ?, 'Scheduled', NOW(), NOW())");
            if ($insAppt) {
                $agendaTxt = "Package Enrollment for {$cleanPkgName} (Order: {$orderId})";
                @mysqli_stmt_bind_param($insAppt, "sisisssss", $appointmentCode, $patientDbId, $patientFullName, $doctorDbId, $doctorName, $cleanPkgName, $apptDate, $apptTime, $agendaTxt);
                @mysqli_stmt_execute($insAppt);
                @mysqli_stmt_close($insAppt);

                recordActivity(
                    $connection1,
                    'Consultation',
                    'consultation.booked',
                    "Patient {$patientFullName} booked consultation {$appointmentCode} with Dr. {$doctorName} on {$displayApptDate} at {$apptTime}",
                    'Consultation',
                    $patientDbId ?: null,
                    $appointmentCode,
                    [
                        'appointment_id' => $appointmentCode,
                        'patient_id' => $patientDbId,
                        'patient_name' => $patientFullName,
                        'doctor_name' => $doctorName,
                        'doctor_id' => $doctorDbId,
                        'appointment_date' => $apptDate,
                        'appointment_time' => $apptTime,
                        'amount' => $amount,
                        'order_id' => $orderId,
                        'gateway' => 'Cashfree'
                    ],
                    'Patient',
                    $patientDbId,
                    $patientFullName
                );
            }

            if ($patientDbId > 0) {
                @mysqli_query($connection1, "UPDATE patients SET package_name = '" . mysqli_real_escape_string($connection1, $cleanPkgName) . "', total_appointments = total_appointments + 1, status = 'Ongoing' WHERE id = $patientDbId");
            }

            recordActivity(
                $connection1,
                'Package',
                'package.purchased',
                "Patient {$patientFullName} purchased package: {$cleanPkgName} (Booking: {$bookingId}, Fee: ₹" . number_format($amount, 2) . ")",
                'Package',
                intval($itemId) ?: null,
                $cleanPkgName,
                [
                    'booking_id' => $bookingId,
                    'package_name' => $cleanPkgName,
                    'patient_id' => $patientDbId,
                    'patient_name' => $patientFullName,
                    'doctor_name' => $doctorName,
                    'doctor_id' => $doctorDbId,
                    'amount' => $amount,
                    'order_id' => $orderId,
                    'gateway' => 'Cashfree'
                ],
                'Patient',
                $patientDbId,
                $patientFullName
            );

        // B. Workshop Fulfillment
        } elseif ($serviceType === 'workshop') {
            $cleanWsTitle = trim(str_ireplace('Workshop:', '', $productInfo));
            $wsId = intval($itemId);

            $insWs = @mysqli_prepare($connection1, "INSERT INTO workshop_bookings 
                (booking_id, workshop_id, doctor_id, doctor_name, doctor_email, doctor_phone, amount, payment_method, payment_status, booking_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'Cashfree', 'Success', NOW())");
            if ($insWs) {
                @mysqli_stmt_bind_param($insWs, "siisssd", $bookingId, $wsId, $doctorDbId, $doctorName, $email, $phone, $amount);
                @mysqli_stmt_execute($insWs);
                @mysqli_stmt_close($insWs);
            }

            if ($wsId > 0) {
                @mysqli_query($connection1, "UPDATE workshops SET registrations = registrations + 1, enrolled = enrolled + 1 WHERE id = $wsId");
            }

            recordActivity(
                $connection1,
                'Workshop',
                'workshop.booked',
                "Patient {$patientFullName} registered for workshop: {$cleanWsTitle} (Booking: {$bookingId}, Fee: ₹" . number_format($amount, 2) . ")",
                'Workshop',
                $wsId,
                $cleanWsTitle,
                [
                    'booking_id' => $bookingId,
                    'workshop_id' => $wsId,
                    'workshop_title' => $cleanWsTitle,
                    'patient_id' => $patientDbId,
                    'patient_name' => $patientFullName,
                    'amount' => $amount,
                    'order_id' => $orderId,
                    'gateway' => 'Cashfree'
                ],
                'Patient',
                $patientDbId,
                $patientFullName
            );

        // C. Consultation Fulfillment
        } elseif ($serviceType === 'consultation') {
            $insAppt = @mysqli_prepare($connection1, "INSERT INTO appointments 
                (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, 'Consultation', ?, ?, '45 min', 'Consultation', ?, 'Scheduled', NOW(), NOW())");
            if ($insAppt) {
                $agendaTxt = "Doctor Consultation with {$doctorName} (Order: {$orderId})";
                @mysqli_stmt_bind_param($insAppt, "sisissss", $appointmentCode, $patientDbId, $patientFullName, $doctorDbId, $doctorName, $apptDate, $apptTime, $agendaTxt);
                @mysqli_stmt_execute($insAppt);
                @mysqli_stmt_close($insAppt);

                if ($patientDbId > 0) {
                    @mysqli_query($connection1, "UPDATE patients SET total_appointments = total_appointments + 1, updated_at = NOW() WHERE id = {$patientDbId}");
                }

                recordActivity(
                    $connection1,
                    'Consultation',
                    'consultation.booked',
                    "Patient {$patientFullName} booked consultation {$appointmentCode} with Dr. {$doctorName} on {$displayApptDate} at {$apptTime}",
                    'Consultation',
                    $patientDbId ?: null,
                    $appointmentCode,
                    [
                        'appointment_id' => $appointmentCode,
                        'patient_id' => $patientDbId,
                        'patient_name' => $patientFullName,
                        'doctor_name' => $doctorName,
                        'doctor_id' => $doctorDbId,
                        'appointment_date' => $apptDate,
                        'appointment_time' => $apptTime,
                        'amount' => $amount,
                        'order_id' => $orderId,
                        'gateway' => 'Cashfree'
                    ],
                    'Patient',
                    $patientDbId,
                    $patientFullName
                );
            }
        }
    } catch (mysqli_sql_exception $fulfillErr) {
        error_log('Cashfree Fulfillment DB Error: ' . $fulfillErr->getMessage());
    } catch (Throwable $fulfillErr) {
        error_log('Cashfree Fulfillment Error: ' . $fulfillErr->getMessage());
    }
}

// Clear session pending
if (!empty($orderId)) {
    unset($_SESSION['cashfree_pending'][$orderId]);
}

$baseUrl = getCashfreeBaseUrl();
$redirectUrl = $baseUrl . '/dashboard/dashboard.html';
if ($serviceType === 'package' || $serviceType === 'programme') {
    $redirectUrl = $baseUrl . '/packages/packages.html';
} elseif ($serviceType === 'workshop') {
    $redirectUrl = $baseUrl . '/courses/courses.html';
} elseif ($serviceType === 'consultation') {
    $redirectUrl = $baseUrl . '/consultation/consultation.html';
}

if ((isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) || (isset($_GET['format']) && $_GET['format'] === 'json')) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => $isSuccess,
        'order_id' => $orderId,
        'cf_payment_id' => $cfPaymentId,
        'status' => $orderStatus,
        'amount' => $amount,
        'booking_id' => $bookingId,
        'service_type' => $serviceType,
        'message' => $isSuccess ? 'Payment confirmed successfully.' : ($errorMsg ?: 'Payment not completed.')
    ], JSON_UNESCAPED_UNICODE);
    exit();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo $isSuccess ? 'Payment Successful - Ocayur Patient Portal' : 'Payment Status - Ocayur Patient Portal'; ?></title>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;1,600&display=swap" rel="stylesheet" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .confirmation-card {
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
      width: 100%;
      max-width: 520px;
      padding: 36px 32px;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .gateway-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #eff6ff;
      color: #2563eb;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      padding: 5px 12px;
      border-radius: 9999px;
      margin-bottom: 24px;
      text-transform: uppercase;
      border: 1px solid #dbeafe;
    }
    .status-icon-wrap {
      width: 76px;
      height: 76px;
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .status-icon-wrap.success {
      background: #dcfce7;
      color: #16a34a;
    }
    .status-icon-wrap.failed {
      background: #fee2e2;
      color: #dc2626;
    }
    .status-icon-wrap svg {
      width: 40px;
      height: 40px;
    }
    .status-title {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 8px;
    }
    .status-subtitle {
      font-size: 14px;
      color: #64748b;
      margin-bottom: 28px;
      line-height: 1.5;
    }
    .receipt-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 28px;
      text-align: left;
    }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      font-size: 13.5px;
      border-bottom: 1px dashed #e2e8f0;
    }
    .receipt-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .receipt-row:first-child {
      padding-top: 0;
    }
    .receipt-label {
      color: #64748b;
      font-weight: 500;
    }
    .receipt-value {
      color: #0f172a;
      font-weight: 700;
    }
    .btn-portal {
      display: inline-block;
      width: 100%;
      background: #005e54;
      color: #ffffff;
      padding: 14px 20px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 700;
      font-size: 15px;
      transition: background 0.2s ease;
    }
    .btn-portal:hover {
      background: #004d45;
    }
    .btn-secondary {
      display: inline-block;
      margin-top: 12px;
      color: #64748b;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
    }
    .btn-secondary:hover {
      color: #0f172a;
    }
  </style>
</head>
<body>
  <div class="confirmation-card">
    <div class="gateway-pill">
      ⚡ Processed securely via Cashfree
    </div>

    <?php if ($isSuccess): ?>
      <div class="status-icon-wrap success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1 class="status-title">Booking & Payment Confirmed!</h1>
      <p class="status-subtitle">Thank you! Your payment was verified and your booking is successfully scheduled.</p>

      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Order ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($orderId); ?></span>
        </div>
        <?php if (!empty($cfPaymentId)): ?>
        <div class="receipt-row">
          <span class="receipt-label">Payment ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($cfPaymentId); ?></span>
        </div>
        <?php endif; ?>
        <div class="receipt-row">
          <span class="receipt-label">Amount Paid</span>
          <span class="receipt-value" style="color: #005e54;"><?php echo htmlspecialchars($formattedAmount); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Item / Service</span>
          <span class="receipt-value"><?php echo htmlspecialchars($productInfo); ?></span>
        </div>
        <?php if ($serviceType === 'consultation' || $serviceType === 'package'): ?>
        <div class="receipt-row">
          <span class="receipt-label">Consultation Code</span>
          <span class="receipt-value"><?php echo htmlspecialchars($appointmentCode); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Doctor</span>
          <span class="receipt-value"><?php echo htmlspecialchars($doctorName); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Appointment Date</span>
          <span class="receipt-value"><?php echo htmlspecialchars($displayApptDate); ?></span>
        </div>
        <?php endif; ?>
        <div class="receipt-row">
          <span class="receipt-label">Gateway Status</span>
          <span class="receipt-value" style="color: #16a34a;">Paid (Success)</span>
        </div>
      </div>

      <a href="<?php echo htmlspecialchars($redirectUrl); ?>" class="btn-portal">
        <?php 
          if ($serviceType === 'package' || $serviceType === 'programme') {
            echo 'View My Packages';
          } elseif ($serviceType === 'workshop') {
            echo 'View My Workshops';
          } elseif ($serviceType === 'consultation') {
            echo 'View My Consultations';
          } else {
            echo 'Go to Dashboard';
          }
        ?>
      </a>

      <script>
        try {
          const bookingItem = {
            id: <?php echo json_encode($bookingId); ?>,
            appointment_id: <?php echo json_encode($appointmentCode); ?>,
            title: <?php echo json_encode($productInfo); ?>,
            amount: <?php echo json_encode($amount); ?>,
            order_id: <?php echo json_encode($orderId); ?>,
            service_type: <?php echo json_encode($serviceType); ?>,
            gateway: 'Cashfree',
            status: 'Success'
          };
          const currentList = JSON.parse(localStorage.getItem('ocayur_patient_bookings') || '[]');
          currentList.unshift(bookingItem);
          localStorage.setItem('ocayur_patient_bookings', JSON.stringify(currentList));
        } catch (e) {}
      </script>

    <?php else: ?>
      <div class="status-icon-wrap failed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
      <h1 class="status-title">Payment Not Completed</h1>
      <div class="status-subtitle">
        <?php 
          if (!empty($errorMsg)) {
            echo '<p>' . htmlspecialchars($errorMsg) . '</p>';
          } else {
            echo '<p>Your payment transaction was declined, cancelled, or expired. Order status: ' . htmlspecialchars($orderStatus) . '</p>';
          }
        ?>
      </div>

      <?php if (!empty($orderId)): ?>
      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Order ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($orderId); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Status</span>
          <span class="receipt-value" style="color: #dc2626;"><?php echo htmlspecialchars(ucfirst(strtolower($orderStatus))); ?></span>
        </div>
      </div>
      <?php endif; ?>

      <?php if (!$config['is_live'] && !empty($orderId)): ?>
      <div style="margin: 16px 0 20px 0; padding: 14px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 12px; text-align: center;">
        <div style="font-size: 13px; font-weight: 700; color: #065f46; margin-bottom: 4px;">🧪 Developer Sandbox Simulation</div>
        <div style="font-size: 12px; color: #047857; margin-bottom: 12px;">Test full database booking fulfillment in test environment:</div>
        <a href="<?php echo htmlspecialchars('cashfree_response.php?' . http_build_query([
          'simulate_success' => '1',
          'order_id' => $orderId,
          'amt' => sprintf('%.2f', $amount)
        ])); ?>" class="btn-portal" style="background: #059669; padding: 10px 18px; font-size: 13px; width: auto; display: inline-block;">
          ✓ Complete Test Booking (Sandbox Simulation)
        </a>
      </div>
      <?php endif; ?>

      <a href="<?php echo htmlspecialchars($redirectUrl); ?>" class="btn-portal">Return to Portal</a>
      <div>
        <a href="javascript:history.back()" class="btn-secondary">&larr; Back to Checkout</a>
      </div>
    <?php endif; ?>

  </div>
</body>
</html>
