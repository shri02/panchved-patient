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
} else {
    foreach ($_GET as $gk => $gv) {
        if (!isset($postData[$gk]) || $postData[$gk] === '') {
            $postData[$gk] = $gv;
        }
    }
}

$config = getPayUConfig();
$salt = $config['salt'];

// Resolve transaction ID across POST, GET, and Session
$txnid = trim((string)($postData['txnid'] ?? ($_GET['txnid'] ?? ($_SESSION['last_payu_txnid'] ?? ''))));

// Look up pending order from session or database if fields are missing from callback
$pending = $_SESSION['payu_pending'][$txnid] ?? null;
if (!$pending && !empty($txnid) && $connection1) {
    $qTx = mysqli_prepare($connection1, "SELECT * FROM `payu_transactions` WHERE `txnid` = ? LIMIT 1");
    if ($qTx) {
        mysqli_stmt_bind_param($qTx, "s", $txnid);
        mysqli_stmt_execute($qTx);
        $rTx = mysqli_stmt_get_result($qTx);
        if ($rowTx = mysqli_fetch_assoc($rTx)) {
            $pending = [
                'service_type' => $rowTx['service_type'],
                'item_id' => $rowTx['item_id'],
                'item_title' => $rowTx['item_title'],
                'patient_name' => $rowTx['patient_name'],
                'patient_email' => $rowTx['patient_email'],
                'patient_phone' => $rowTx['patient_phone'],
                'amount' => $rowTx['amount']
            ];
        }
        mysqli_stmt_close($qTx);
    }
}

$isSimulation = (!$config['is_live'] && isset($_GET['simulate_success']) && $_GET['simulate_success'] == '1');

$status = strtolower(trim((string)($postData['status'] ?? ($_GET['status'] ?? ''))));
if ($isSimulation || (empty($status) && isset($postData['unmappedstatus']) && in_array(strtolower($postData['unmappedstatus']), ['captured', 'success', 'successful']))) {
    $status = 'success';
}
if (empty($status)) {
    $status = 'failed';
}

$amount = floatval($postData['amount'] ?? ($_GET['amt'] ?? ($pending['amount'] ?? 0.00)));
$productInfo = trim((string)($postData['productinfo'] ?? ($pending['item_title'] ?? 'Ocayur Healthcare')));
$firstName = trim((string)($postData['firstname'] ?? ($pending['patient_name'] ?? 'Patient')));
$email = trim((string)($postData['email'] ?? ($pending['patient_email'] ?? '')));
$phone = trim((string)($postData['phone'] ?? ($pending['patient_phone'] ?? '')));
$key = trim((string)($postData['key'] ?? ''));
$mihpayid = trim((string)($postData['mihpayid'] ?? ($isSimulation ? ('SIM_' . time()) : '')));
$bankRefNum = trim((string)($postData['bank_ref_num'] ?? ($isSimulation ? ('SIM_REF_' . rand(100000, 999999)) : '')));
$errorMsg = trim((string)(
    $postData['error'] 
    ?? ($postData['error_Message'] 
    ?? ($postData['errorMessage'] 
    ?? ($postData['field9'] 
    ?? ($postData['unmappedstatus'] ?? ''))))
));

$udf1 = trim((string)($postData['udf1'] ?? ($pending['service_type'] ?? ($_GET['service'] ?? 'package'))));
$udf2 = trim((string)($postData['udf2'] ?? ($pending['item_id'] ?? '')));
$udf3 = trim((string)($postData['udf3'] ?? ($pending['patient_id'] ?? '')));
$udf4 = trim((string)($postData['udf4'] ?? ($pending['doctor_name'] ?? 'Dr. Nidhi Jha')));
$udf5 = trim((string)($postData['udf5'] ?? ''));

$serviceType = !empty($udf1) ? strtolower($udf1) : 'package';
$meta = json_decode($udf5, true) ?: ($pending ?? []);

// Verify Hash (With test-mode tolerance for simulated test bank responses)
$hashValid = false;
if (!empty($salt) && !empty($postData['hash'])) {
    $hashValid = verifyPayUResponseHash($postData, $salt);
}

// In test environment, accept simulated test bank success
if (!$hashValid && !$config['is_live']) {
    if ($isSimulation || $status === 'success' || (isset($postData['unmappedstatus']) && in_array(strtolower($postData['unmappedstatus']), ['captured', 'success']))) {
        $hashValid = true;
    }
}

$isSuccess = ($status === 'success' && $hashValid && !empty($txnid));
$bookingId = '#' . rand(100000, 999999);
$appointmentCode = 'APT-' . date('Ymd') . '-' . rand(100, 999);
$formattedAmount = '₹' . number_format($amount > 0 ? $amount : 0.00, 2);

$doctorName = !empty($udf4) ? $udf4 : ($pending['doctor_name'] ?? 'Dr. Nidhi Jha');
$apptDate = $meta['date'] ?? ($pending['appointment_date'] ?? date('Y-m-d'));
$apptTime = $meta['time'] ?? ($pending['appointment_time'] ?? '07:00 - 07:45 PM');

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
      <div class="status-subtitle">
        <?php 
          if (!empty($errorMsg)) {
            if (stripos($errorMsg, 'circuit breaker') !== false || stripos($errorMsg, 'uat-onboarding') !== false) {
              echo '<p style="color:#b91c1c; font-weight:600; margin-bottom:8px;">PayU Gateway Error: Salt could not be fetched</p>';
              echo '<p style="font-size:13px; color:#4b5563; line-height:1.5;">PayU Sandbox reported an onboarding circuit breaker error. This typically happens when a <strong>Live Production Merchant Key</strong> is used in Sandbox/Test mode, or when PayU\'s test service is temporarily down.</p>';
              echo '<div style="background:#f1f5f9; padding:10px 14px; border-radius:8px; font-size:12px; color:#334155; margin-top:10px; text-align:left;">';
              echo '<strong>To fix in Azure App Service Configuration:</strong><br>';
              echo '• For Test Mode: set <code>PAYU_MERCHANT_KEY = gtKFFx</code> and <code>PAYU_SALT = 4R38IvwiV57FwVpsgOvTXBdLE4tHUXFW</code> (PayU Official Sandbox Key/Salt).<br>';
              echo '• For Production: set <code>PAYU_ENV = prod</code> with your live merchant credentials.';
              echo '</div>';
            } else {
              echo '<p>' . htmlspecialchars($errorMsg) . '</p>';
            }
          } elseif (empty($postData) || empty($txnid)) {
            echo '<p>No payment transaction data was received from the gateway. If your payment was completed, please return to your portal.</p>';
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
          <span class="receipt-value" style="color: #ef4444;"><?php echo htmlspecialchars(ucfirst($status)); ?></span>
        </div>
      </div>
      <?php endif; ?>

      <?php if (!$config['is_live'] && !empty($txnid)): ?>
      <div style="margin: 16px 0 20px 0; padding: 14px; background: #ecfdf5; border: 1px dashed #10b981; border-radius: 12px; text-align: center;">
        <div style="font-size: 13px; font-weight: 700; color: #065f46; margin-bottom: 4px;">🧪 Developer Sandbox Bypass</div>
        <div style="font-size: 12px; color: #047857; margin-bottom: 12px;">Test full database booking fulfillment and dashboard syncing without waiting for PayU test servers:</div>
        <a href="<?php echo htmlspecialchars('payu_response.php?' . http_build_query([
          'simulate_success' => '1',
          'txnid' => $txnid,
          'service' => $serviceType,
          'amt' => sprintf('%.2f', $amount)
        ])); ?>" class="btn-action" style="background: #059669; padding: 10px 18px; font-size: 13px; width: auto; display: inline-block;">
          ✓ Complete Test Booking (Sandbox Simulation)
        </a>
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
