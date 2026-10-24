<?php
/**
 * Ocayur / Panchved - PayU Payment Response & Webhook Callback Handler
 * 
 * Receives both Success (surl) and Failure (furl) callbacks from PayU.
 * Verifies reverse SHA-512 hash, fulfills booking in MySQL, and displays confirmation.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/payu_config.php';

$postData = $_POST;
if (empty($postData)) {
    $raw = file_get_contents('php://input');
    if (!empty($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $postData = $decoded;
        } else {
            parse_str($raw, $postData);
        }
    }
}
if (empty($postData)) {
    $postData = $_GET;
}

$config = getPayUConfig();
$salt = $config['salt'];

$txnid = trim((string)($postData['txnid'] ?? ($_GET['txnid'] ?? ($_SESSION['last_payu_txnid'] ?? ''))));

// Look up session pending data if available
$pending = $_SESSION['payu_pending'][$txnid] ?? null;

$status = strtolower(trim((string)($postData['status'] ?? ($_GET['status'] ?? ''))));
if (empty($status) && isset($postData['unmappedstatus']) && in_array(strtolower($postData['unmappedstatus']), ['captured', 'success', 'successful'], true)) {
    $status = 'success';
}

$amount = floatval($postData['amount'] ?? ($_GET['amt'] ?? ($pending['amount'] ?? 0.00)));
$productInfo = trim((string)($postData['productinfo'] ?? ($pending['item_title'] ?? 'Healthcare Service')));
$firstName = trim((string)($postData['firstname'] ?? ($pending['patient_name'] ?? 'Patient')));
$email = trim((string)($postData['email'] ?? ($pending['patient_email'] ?? '')));
$phone = trim((string)($postData['phone'] ?? ($pending['patient_phone'] ?? '')));
$mihpayid = trim((string)($postData['mihpayid'] ?? ''));
$bankRefNum = trim((string)($postData['bank_ref_num'] ?? ''));
$errorMsg = trim((string)($postData['error_Message'] ?? ($postData['errorMessage'] ?? ($postData['error'] ?? ''))));

$udf1 = trim((string)($postData['udf1'] ?? ($pending['service_type'] ?? 'package')));
$udf2 = trim((string)($postData['udf2'] ?? ($pending['item_id'] ?? '')));
$udf3 = trim((string)($postData['udf3'] ?? ($pending['patient_id'] ?? '')));
$udf4 = trim((string)($postData['udf4'] ?? ($pending['doctor_name'] ?? 'Dr. Nidhi Jha')));
$udf5 = trim((string)($postData['udf5'] ?? ''));

$serviceType = !empty($udf1) ? strtolower($udf1) : 'package';
$meta = json_decode($udf5, true) ?: ($pending ?? []);

// Verify Hash
$hashValid = false;
if (!empty($salt) && !empty($postData['hash'])) {
    $hashValid = verifyPayUResponseHash($postData, $salt);
}

// In test environment, accept simulated test bank success
if (!$hashValid && !$config['is_live']) {
    if ($status === 'success' || (isset($postData['unmappedstatus']) && in_array(strtolower($postData['unmappedstatus']), ['captured', 'success']))) {
        $hashValid = true;
    }
}

$isSuccess = ($status === 'success' && $hashValid && !empty($txnid));
$bookingId = '#' . mt_rand(100000, 999999);
$appointmentCode = 'APT-' . date('Ymd') . '-' . mt_rand(100, 999);
$formattedAmount = '₹' . number_format($amount > 0 ? $amount : 0.00, 2);

$doctorName = !empty($udf4) ? $udf4 : ($pending['doctor_name'] ?? 'Dr. Nidhi Jha');
$apptDate = $meta['date'] ?? ($pending['appointment_date'] ?? date('Y-m-d'));
$apptTime = $meta['time'] ?? ($pending['appointment_time'] ?? '07:00 - 07:45 PM');

mysqli_report(MYSQLI_REPORT_OFF);

// Log callback for debugging
@file_put_contents(
    __DIR__ . '/payu_debug.log',
    "[" . date('Y-m-d H:i:s') . "] METHOD=" . ($_SERVER['REQUEST_METHOD'] ?? 'GET') . 
    " STATUS=" . $status . 
    " TXNID=" . $txnid . 
    " HASH_VALID=" . ($hashValid ? 'YES' : 'NO') . 
    " POST=" . json_encode($postData) . "\n",
    FILE_APPEND
);

// Update payu_transactions table
if ($connection1 && !empty($txnid)) {
    try {
        $insTx = @mysqli_prepare($connection1, "INSERT INTO `payu_transactions` 
            (`txnid`, `mihpayid`, `service_type`, `item_id`, `item_title`, `patient_name`, `patient_email`, `patient_phone`, `amount`, `payment_method`, `payment_status`, `bank_ref_num`, `raw_response`, `created_at`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PayU', ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                `mihpayid` = VALUES(`mihpayid`),
                `payment_status` = VALUES(`payment_status`),
                `bank_ref_num` = VALUES(`bank_ref_num`),
                `raw_response` = VALUES(`raw_response`)");
        if ($insTx) {
            $pStatus = $isSuccess ? 'Success' : 'Failed';
            $rawJson = json_encode($postData);
            $amtVal = floatval($amount);
            @mysqli_stmt_bind_param($insTx, "ssssssssdsss", 
                $txnid, $mihpayid, $serviceType, $udf2, $productInfo, $firstName, $email, $phone, $amtVal, $pStatus, $bankRefNum, $rawJson
            );
            @mysqli_stmt_execute($insTx);
            @mysqli_stmt_close($insTx);
        }
    } catch (Throwable $txErr) {
        error_log('PayU Txn Log Error: ' . $txErr->getMessage());
    }
}

// ----------------------------------------------------------------------------
// DB BOOKING FULFILLMENT ON SUCCESS
// ----------------------------------------------------------------------------
if ($isSuccess && $connection1) {
    try {
        $cleanPhone = preg_replace('/[^\d]/', '', $phone);
        if (strlen($cleanPhone) === 12 && substr($cleanPhone, 0, 2) === '91') {
            $cleanPhone = substr($cleanPhone, 2);
        }

        // Resolve Patient ID
        $patientDbId = (int)$udf3;
        if ($patientDbId <= 0) {
            $pQuery = "SELECT id, full_name FROM patients WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) OR (email != '' AND email = ?) LIMIT 1";
            if ($pStmt = @mysqli_prepare($connection1, $pQuery)) {
                @mysqli_stmt_bind_param($pStmt, "sss", $phone, $cleanPhone, $email);
                @mysqli_stmt_execute($pStmt);
                $pRes = @mysqli_stmt_get_result($pStmt);
                if ($pRow = @mysqli_fetch_assoc($pRes)) {
                    $patientDbId = (int)$pRow['id'];
                }
                @mysqli_stmt_close($pStmt);
            }
        }

        // Resolve Doctor ID
        $doctorDbId = 1;
        $dQuery = "SELECT id FROM doctors WHERE full_name = ? OR full_name LIKE ? LIMIT 1";
        if ($dStmt = @mysqli_prepare($connection1, $dQuery)) {
            $docLike = '%' . $doctorName . '%';
            @mysqli_stmt_bind_param($dStmt, "ss", $doctorName, $docLike);
            @mysqli_stmt_execute($dStmt);
            $dRes = @mysqli_stmt_get_result($dStmt);
            if ($dRow = @mysqli_fetch_assoc($dRes)) {
                $doctorDbId = (int)$dRow['id'];
            }
            @mysqli_stmt_close($dStmt);
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
                $agendaTxt = "Package Enrollment for {$cleanPkgName} (Txn: {$txnid})";
                @mysqli_stmt_bind_param($insAppt, "sisisssss", $appointmentCode, $patientDbId, $firstName, $doctorDbId, $doctorName, $cleanPkgName, $apptDate, $apptTime, $agendaTxt);
                @mysqli_stmt_execute($insAppt);
                @mysqli_stmt_close($insAppt);
            }

            if ($patientDbId > 0) {
                @mysqli_query($connection1, "UPDATE patients SET package_name = '" . mysqli_real_escape_string($connection1, $cleanPkgName) . "', total_appointments = total_appointments + 1, status = 'Ongoing' WHERE id = $patientDbId");
            }

        // B. Workshop Fulfillment
        } elseif ($serviceType === 'workshop') {
            $cleanWsTitle = trim(str_ireplace('Workshop:', '', $productInfo));
            $wsId = intval($udf2);

            $insWs = @mysqli_prepare($connection1, "INSERT INTO workshop_bookings 
                (booking_id, workshop_id, doctor_id, doctor_name, doctor_email, doctor_phone, amount, payment_method, payment_status, booking_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'PayU', 'Success', NOW())");
            if ($insWs) {
                @mysqli_stmt_bind_param($insWs, "siisssd", $bookingId, $wsId, $doctorDbId, $doctorName, $email, $phone, $amount);
                @mysqli_stmt_execute($insWs);
                @mysqli_stmt_close($insWs);
            }

            if ($wsId > 0) {
                @mysqli_query($connection1, "UPDATE workshops SET registrations = registrations + 1, enrolled = enrolled + 1 WHERE id = $wsId");
            }

        // C. Consultation Fulfillment
        } elseif ($serviceType === 'consultation') {
            $insAppt = @mysqli_prepare($connection1, "INSERT INTO appointments 
                (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, 'Consultation', ?, ?, '45 min', 'Consultation', ?, 'Scheduled', NOW(), NOW())");
            if ($insAppt) {
                $agendaTxt = "Doctor Consultation with {$doctorName} (Txn: {$txnid})";
                @mysqli_stmt_bind_param($insAppt, "sisissss", $appointmentCode, $patientDbId, $firstName, $doctorDbId, $doctorName, $apptDate, $apptTime, $agendaTxt);
                @mysqli_stmt_execute($insAppt);
                @mysqli_stmt_close($insAppt);
            }
        }
    } catch (Throwable $fulfillErr) {
        error_log('PayU Booking Fulfillment Error: ' . $fulfillErr->getMessage());
    }
}

// Clear session pending
unset($_SESSION['payu_pending'][$txnid]);

$baseUrl = getPayUBaseUrl();
$dashboardUrl = $baseUrl . '/dashboard/';
if ($serviceType === 'workshop') {
    $redirectUrl = $baseUrl . '/courses/';
} elseif ($serviceType === 'consultation') {
    $redirectUrl = $baseUrl . '/consultation/';
} else {
    $redirectUrl = $dashboardUrl;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo $isSuccess ? 'Payment Successful - Ocayur' : 'Payment Status - Ocayur'; ?></title>
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
      background: #f1f5f9;
      color: #64748b;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      padding: 5px 12px;
      border-radius: 9999px;
      margin-bottom: 24px;
      text-transform: uppercase;
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
      Processed securely via PayU
    </div>

    <?php if ($isSuccess): ?>
      <div class="status-icon-wrap success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1 class="status-title">Payment Completed!</h1>
      <p class="status-subtitle">Thank you for your payment. Your booking has been confirmed.</p>

      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Transaction ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($txnid); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Amount Paid</span>
          <span class="receipt-value" style="color: #005e54;"><?php echo htmlspecialchars($formattedAmount); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Service</span>
          <span class="receipt-value"><?php echo htmlspecialchars($productInfo); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Booking Reference</span>
          <span class="receipt-value"><?php echo htmlspecialchars($bookingId); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Status</span>
          <span class="receipt-value" style="color: #16a34a;">Success</span>
        </div>
      </div>

      <a href="<?php echo htmlspecialchars($redirectUrl); ?>" class="btn-portal">Go to Patient Portal</a>

      <script>
        try {
          // Sync live local storage for instant UI reflection
          const isWorkshop = <?php echo json_encode($serviceType === 'workshop'); ?>;
          if (isWorkshop) {
            const wsItem = {
              id: <?php echo json_encode($udf2); ?>,
              workshop_id: <?php echo json_encode($udf2); ?>,
              booking_id: <?php echo json_encode($bookingId); ?>,
              title: <?php echo json_encode($productInfo); ?>,
              amount: <?php echo json_encode($amount); ?>,
              date: <?php echo json_encode($apptDate); ?>,
              time: <?php echo json_encode($apptTime); ?>,
              status: 'Success'
            };
            const currentList = JSON.parse(localStorage.getItem('ocayur_registered_workshops') || localStorage.getItem('panchved_registered_workshops') || '[]');
            currentList.unshift(wsItem);
            localStorage.setItem('ocayur_registered_workshops', JSON.stringify(currentList));
            localStorage.setItem('panchved_registered_workshops', JSON.stringify(currentList));
          }
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
          } elseif ($status === 'success' && !$hashValid && !empty($salt)) {
            echo '<p>Security signature verification failed. Please contact support if your account was debited.</p>';
          } else {
            echo '<p>Your payment transaction was declined or cancelled. No amount was deducted.</p>';
          }
        ?>
      </div>

      <?php if (!empty($txnid)): ?>
      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Transaction ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($txnid); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Status</span>
          <span class="receipt-value" style="color: #dc2626;"><?php echo htmlspecialchars(ucfirst($status ?: 'Failed')); ?></span>
        </div>
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
