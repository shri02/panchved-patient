<?php
/**
 * Ocayur / Panchved - PayU Payment Response & Webhook Handler
 * 
 * Receives both Success (surl) and Failure (furl) callbacks from PayU.
 * Verifies reverse SHA-512 hash, processes booking fulfillment in MySQL,
 * and renders a confirmation page with real-time localStorage sync.
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
        parse_str($raw, $postData);
    }
}
if (empty($postData) && !empty($_GET)) {
    $postData = $_GET;
}

$config = getPayUConfig();
$salt = $config['salt'];

$status = strtolower(trim((string)($postData['status'] ?? 'failed')));
$txnid = trim((string)($postData['txnid'] ?? ''));
$amount = floatval($postData['amount'] ?? 0.00);
$productInfo = trim((string)($postData['productinfo'] ?? 'Ocayur Healthcare'));
$firstName = trim((string)($postData['firstname'] ?? 'Patient'));
$email = trim((string)($postData['email'] ?? ''));
$phone = trim((string)($postData['phone'] ?? ''));
$key = trim((string)($postData['key'] ?? ''));
$mihpayid = trim((string)($postData['mihpayid'] ?? ''));
$bankRefNum = trim((string)($postData['bank_ref_num'] ?? ''));
$errorMsg = trim((string)($postData['error_Message'] ?? ($postData['unmappedstatus'] ?? '')));

$udf1 = trim((string)($postData['udf1'] ?? 'package')); // service_type
$udf2 = trim((string)($postData['udf2'] ?? ''));        // item_id / code
$udf3 = trim((string)($postData['udf3'] ?? ''));        // patient_id / phone
$udf4 = trim((string)($postData['udf4'] ?? ''));        // doctor_name
$udf5 = trim((string)($postData['udf5'] ?? ''));        // JSON metadata

$serviceType = !empty($udf1) ? strtolower($udf1) : 'package';
$meta = json_decode($udf5, true) ?: [];

// Verify Hash (Allow bypass only if test mode without salt or if hash verification succeeds)
$hashValid = false;
if (!empty($salt)) {
    $hashValid = verifyPayUResponseHash($postData, $salt);
} elseif (!$config['is_configured']) {
    // Development fallback when credentials haven't been added yet
    $hashValid = true;
}

$isSuccess = ($status === 'success' && $hashValid);
$bookingId = '#' . rand(100000, 999999);
$appointmentCode = 'APT-' . date('Ymd') . '-' . rand(100, 999);
$formattedAmount = '₹' . number_format($amount > 0 ? $amount : 0.00, 2);

$doctorName = !empty($udf4) ? $udf4 : 'Dr. Nidhi Jha';
$apptDate = $meta['date'] ?? date('Y-m-d');
$apptTime = $meta['time'] ?? '07:00 - 07:45 PM';

// Log PayU callback for diagnostics
@file_put_contents(
    __DIR__ . '/payu_debug.log',
    "[" . date('Y-m-d H:i:s') . "] METHOD=" . ($_SERVER['REQUEST_METHOD'] ?? 'UNKNOWN') . 
    " HTTPS=" . (isset($_SERVER['HTTPS']) ? $_SERVER['HTTPS'] : 'off') . 
    " PROTO=" . ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? 'none') . 
    " POST_COUNT=" . count($_POST) . 
    " TXNID=" . ($postData['txnid'] ?? 'empty') . 
    " STATUS=" . ($postData['status'] ?? 'empty') . 
    " HASH_VALID=" . ($hashValid ? 'true' : 'false') . 
    " RAW=" . json_encode($postData) . "\n",
    FILE_APPEND
);

// Try to record in `payu_transactions` table
if ($connection1 && !empty($txnid)) {
    $insTx = mysqli_prepare($connection1, "INSERT INTO `payu_transactions` 
        (`txnid`, `mihpayid`, `service_type`, `item_id`, `item_title`, `patient_name`, `patient_email`, `patient_phone`, `amount`, `payment_method`, `payment_status`, `bank_ref_num`, `raw_response`, `created_at`)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PayU', ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE `payment_status` = VALUES(`payment_status`), `bank_ref_num` = VALUES(`bank_ref_num`), `raw_response` = VALUES(`raw_response`)");
    if ($insTx) {
        $pStatus = $isSuccess ? 'Success' : 'Failed';
        $rawJson = json_encode($postData);
        $amtVal = floatval($amount);
        mysqli_stmt_bind_param($insTx, "ssssssssdsss", 
            $txnid, $mihpayid, $serviceType, $udf2, $productInfo, $firstName, $email, $phone, $amtVal, $pStatus, $bankRefNum, $rawJson
        );
        mysqli_stmt_execute($insTx);
        mysqli_stmt_close($insTx);
    }
}

// ----------------------------------------------------------------------------
// DB FULFILLMENT ON SUCCESS
// ----------------------------------------------------------------------------
if ($isSuccess && $connection1) {
    $cleanPhone = preg_replace('/[^\d]/', '', $phone);
    if (strlen($cleanPhone) === 12 && substr($cleanPhone, 0, 2) === '91') {
        $cleanPhone = substr($cleanPhone, 2);
    }

    // 1. Resolve Patient DB ID
    $patientDbId = 0;
    $pQuery = "SELECT id, full_name FROM patients WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) OR (email != '' AND email = ?) LIMIT 1";
    if ($pStmt = mysqli_prepare($connection1, $pQuery)) {
        mysqli_stmt_bind_param($pStmt, "sss", $phone, $cleanPhone, $email);
        mysqli_stmt_execute($pStmt);
        $pRes = mysqli_stmt_get_result($pStmt);
        if ($pRow = mysqli_fetch_assoc($pRes)) {
            $patientDbId = (int)$pRow['id'];
        }
        mysqli_stmt_close($pStmt);
    }

    // Resolve Doctor DB ID
    $doctorDbId = 1;
    $dQuery = "SELECT id FROM doctors WHERE full_name = ? OR full_name LIKE ? LIMIT 1";
    if ($dStmt = mysqli_prepare($connection1, $dQuery)) {
        $docLike = '%' . $doctorName . '%';
        mysqli_stmt_bind_param($dStmt, "ss", $doctorName, $docLike);
        mysqli_stmt_execute($dStmt);
        $dRes = mysqli_stmt_get_result($dStmt);
        if ($dRow = mysqli_fetch_assoc($dRes)) {
            $doctorDbId = (int)$dRow['id'];
        }
        mysqli_stmt_close($dStmt);
    }

    // A. PACKAGE FULFILLMENT
    if ($serviceType === 'package' || $serviceType === 'programme') {
        $cleanPkgName = trim(str_ireplace('Package:', '', $productInfo));
        if (empty($cleanPkgName)) $cleanPkgName = 'Gut Healing Package';

        // Insert into patient_packages
        $insPpkg = mysqli_prepare($connection1, "INSERT INTO patient_packages 
            (booking_id, patient_id, patient_phone, package_name, doctor_id, doctor_name, price, booking_date, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'Active', NOW(), NOW())");
        if ($insPpkg) {
            mysqli_stmt_bind_param($insPpkg, "sissisd", $bookingId, $patientDbId, $phone, $cleanPkgName, $doctorDbId, $doctorName, $amount);
            mysqli_stmt_execute($insPpkg);
            mysqli_stmt_close($insPpkg);
        }

        // Insert into appointments
        $insAppt = mysqli_prepare($connection1, "INSERT INTO appointments 
            (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, '45 min', 'Package Consultation', ?, 'Scheduled', NOW(), NOW())");
        if ($insAppt) {
            $agendaTxt = "Package Enrollment for {$cleanPkgName} (PayU Txn: {$txnid})";
            mysqli_stmt_bind_param($insAppt, "sisisssss", $appointmentCode, $patientDbId, $firstName, $doctorDbId, $doctorName, $cleanPkgName, $apptDate, $apptTime, $agendaTxt);
            mysqli_stmt_execute($insAppt);
            mysqli_stmt_close($insAppt);
        }

        // Increment packages counter
        mysqli_query($connection1, "UPDATE packages SET enrollments = enrollments + 1 WHERE package_name = '" . mysqli_real_escape_string($connection1, $cleanPkgName) . "'");

        // Update patient status
        if ($patientDbId > 0) {
            mysqli_query($connection1, "UPDATE patients SET package_name = '" . mysqli_real_escape_string($connection1, $cleanPkgName) . "', total_appointments = total_appointments + 1, status = 'Ongoing' WHERE id = $patientDbId");
        }

    // B. WORKSHOP FULFILLMENT
    } elseif ($serviceType === 'workshop') {
        $cleanWsTitle = trim(str_ireplace('Workshop:', '', $productInfo));
        $wsId = intval($udf2);

        $insWs = mysqli_prepare($connection1, "INSERT INTO workshop_bookings 
            (booking_id, workshop_id, doctor_id, doctor_name, doctor_email, doctor_phone, amount, payment_method, payment_status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'PayU', 'Success', NOW())");
        if ($insWs) {
            mysqli_stmt_bind_param($insWs, "siisssd", $bookingId, $wsId, $patientDbId, $firstName, $email, $phone, $amount);
            mysqli_stmt_execute($insWs);
            mysqli_stmt_close($insWs);
        }

        if ($wsId > 0) {
            mysqli_query($connection1, "UPDATE workshops SET registrations = registrations + 1, enrolled = enrolled + 1 WHERE id = $wsId");
        }

    // C. CONSULTATION FULFILLMENT
    } elseif ($serviceType === 'consultation') {
        $insAppt = mysqli_prepare($connection1, "INSERT INTO appointments 
            (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'Consultation', ?, ?, '45 min', 'Consultation', ?, 'Scheduled', NOW(), NOW())");
        if ($insAppt) {
            $agendaTxt = "Doctor Consultation with {$doctorName} (PayU Txn: {$txnid})";
            mysqli_stmt_bind_param($insAppt, "sisisssss", $appointmentCode, $patientDbId, $firstName, $doctorDbId, $doctorName, $apptDate, $apptTime, $agendaTxt);
            mysqli_stmt_execute($insAppt);
            mysqli_stmt_close($insAppt);
        }
    }
}

// Redirect target path (points directly to portal.ocayur.com)
$portalBase = getPayUBaseUrl();
$redirectTarget = $portalBase . '/dashboard/dashboard.html';
if ($serviceType === 'package' || $serviceType === 'programme') {
    $redirectTarget = $portalBase . '/packages/package.html#my-packages';
} elseif ($serviceType === 'workshop') {
    $redirectTarget = $portalBase . '/courses/courses.html#my-workshops';
} elseif ($serviceType === 'consultation') {
    $redirectTarget = $portalBase . '/consultation/consultation.html#my-appointments';
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?php echo $isSuccess ? 'Payment Successful - Ocayur' : 'Payment Incomplete - Ocayur'; ?></title>
  <link rel="icon" type="image/png" href="../assets/favicon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0f766e;
      --primary-dark: #115e59;
      --primary-light: #ccfbf1;
      --success: #10b981;
      --danger: #ef4444;
      --text-main: #0f172a;
      --text-muted: #64748b;
      --bg-page: #f8fafc;
      --card-bg: #ffffff;
      --border-color: #e2e8f0;
      --shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, sans-serif;
      background: var(--bg-page);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .payment-modal-card {
      background: var(--card-bg);
      border-radius: 20px;
      box-shadow: var(--shadow);
      max-width: 520px;
      width: 100%;
      padding: 40px 32px;
      text-align: center;
      border: 1px solid var(--border-color);
      animation: popIn 0.35s ease-out;
    }
    @keyframes popIn {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .status-badge-icon {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .status-badge-icon.success {
      background: #ecfdf5;
      color: var(--success);
      box-shadow: 0 0 0 10px rgba(16, 185, 129, 0.12);
    }
    .status-badge-icon.failed {
      background: #fef2f2;
      color: var(--danger);
      box-shadow: 0 0 0 10px rgba(239, 68, 68, 0.12);
    }
    .status-title {
      font-family: 'Outfit', sans-serif;
      font-size: 26px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .status-subtitle {
      font-size: 14px;
      color: var(--text-muted);
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .receipt-box {
      background: #f8fafc;
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 24px;
      text-align: left;
    }
    .receipt-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 0;
      font-size: 13.5px;
      border-bottom: 1px dashed var(--border-color);
    }
    .receipt-row:last-child {
      border-bottom: none;
      padding-top: 12px;
      font-size: 15px;
      font-weight: 700;
      color: var(--primary);
    }
    .receipt-label {
      color: var(--text-muted);
    }
    .receipt-value {
      font-weight: 600;
      color: var(--text-main);
      word-break: break-all;
    }
    .btn-action {
      display: block;
      width: 100%;
      padding: 14px 24px;
      background: var(--primary);
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      border-radius: 12px;
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
    }
    .btn-action:hover {
      background: var(--primary-dark);
      transform: translateY(-1px);
    }
    .btn-retry {
      display: block;
      width: 100%;
      padding: 14px 24px;
      background: #ef4444;
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 15px;
      border-radius: 12px;
      margin-top: 10px;
    }
    .btn-secondary {
      display: inline-block;
      margin-top: 14px;
      color: var(--text-muted);
      text-decoration: none;
      font-size: 13.5px;
      font-weight: 500;
    }
    .btn-secondary:hover { color: var(--primary); }
    .gateway-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      background: #f1f5f9;
      padding: 4px 12px;
      border-radius: 20px;
      color: var(--text-muted);
      margin-bottom: 16px;
    }
  </style>
</head>
<body>

  <div class="payment-modal-card">
    <div class="gateway-pill">
      <span>Processed securely via PayU</span>
    </div>

    <?php if ($isSuccess): ?>
      <div class="status-badge-icon success">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h1 class="status-title">Thank you for your booking!</h1>
      <p class="status-subtitle">
        Your payment of <strong><?php echo htmlspecialchars($formattedAmount); ?></strong> was received successfully. Your booking is confirmed.
      </p>

      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Booking ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($bookingId); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Item</span>
          <span class="receipt-value"><?php echo htmlspecialchars($productInfo); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">PayU Transaction ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($txnid); ?></span>
        </div>
        <?php if (!empty($mihpayid)): ?>
        <div class="receipt-row">
          <span class="receipt-label">Payment ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($mihpayid); ?></span>
        </div>
        <?php endif; ?>
        <div class="receipt-row">
          <span class="receipt-label">Total Amount</span>
          <span class="receipt-value"><?php echo htmlspecialchars($formattedAmount); ?></span>
        </div>
      </div>

      <a href="<?php echo htmlspecialchars($redirectTarget); ?>" class="btn-action">
        Continue to My Dashboard
      </a>

      <script>
        // Synchronize client-side localStorage state so all views reflect the new purchase immediately
        try {
          const serviceType = <?php echo json_encode($serviceType); ?>;
          const bookingId = <?php echo json_encode($bookingId); ?>;
          const title = <?php echo json_encode($productInfo); ?>;
          const price = <?php echo json_encode($amount); ?>;
          const docName = <?php echo json_encode($doctorName); ?>;
          const apptDate = <?php echo json_encode($apptDate); ?>;
          const apptTime = <?php echo json_encode($apptTime); ?>;

          if (serviceType === 'package' || serviceType === 'programme') {
            let booked = JSON.parse(localStorage.getItem('ocayur_booked_packages') || '[]');
            if (!Array.isArray(booked)) booked = [];
            booked.unshift({
              booking_id: bookingId,
              package_name: title.replace(/^Package:\s*/i, ''),
              doctor_name: docName,
              price: price,
              booking_date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
              booking_status: 'Active'
            });
            localStorage.setItem('ocayur_booked_packages', JSON.stringify(booked));

            const curPat = JSON.parse(localStorage.getItem('ocayur_patient') || '{}');
            curPat.package_name = title.replace(/^Package:\s*/i, '');
            localStorage.setItem('ocayur_patient', JSON.stringify(curPat));
          } else if (serviceType === 'workshop') {
            let wsList = JSON.parse(localStorage.getItem('ocayur_registered_workshops') || '[]');
            if (!Array.isArray(wsList)) wsList = [];
            wsList.unshift({
              id: <?php echo json_encode($udf2); ?>,
              booking_id: bookingId,
              title: title.replace(/^Workshop:\s*/i, ''),
              price: '₹' + price,
              date: apptDate,
              time: apptTime
            });
            localStorage.setItem('ocayur_registered_workshops', JSON.stringify(wsList));
          }
        } catch (e) {
          console.warn('LocalStorage sync warning:', e);
        }
      </script>

    <?php else: ?>
      <div class="status-badge-icon failed">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>
      <h1 class="status-title">Payment Not Completed</h1>
      <p class="status-subtitle">
        <?php 
          if (empty($postData) || empty($txnid)) {
            echo 'No payment transaction data was received from the gateway. If your payment was completed, please return to your portal.';
          } elseif (!$hashValid && !empty($salt)) {
            echo 'Security signature verification failed. Please contact support if your account was debited.';
          } elseif (!empty($errorMsg)) {
            echo htmlspecialchars($errorMsg);
          } else {
            echo 'Your payment transaction was declined or cancelled. No amount was deducted.';
          }
        ?>
      </p>

      <?php if (!empty($txnid)): ?>
      <div class="receipt-box">
        <div class="receipt-row">
          <span class="receipt-label">Transaction ID</span>
          <span class="receipt-value"><?php echo htmlspecialchars($txnid); ?></span>
        </div>
        <div class="receipt-row">
          <span class="receipt-label">Status</span>
          <span class="receipt-value" style="color: #ef4444;"><?php echo htmlspecialchars(ucfirst($status)); ?></span>
        </div>
      </div>
      <?php endif; ?>

      <a href="<?php echo htmlspecialchars($redirectTarget); ?>" class="btn-action">
        Return to Portal
      </a>
      <a href="javascript:history.back()" class="btn-secondary">
        ← Back to Checkout
      </a>
    <?php endif; ?>

  </div>

</body>
</html>
