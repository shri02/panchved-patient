<?php
/**
 * Ocayur Patient Portal - Forgot Password & OTP Management API
 * 
 * Endpoints:
 * 1. action=send_otp: Validates patient, checks for valid email, generates OTP, sends email via Gmail SMTP
 * 2. action=verify_otp: Validates that the 6-digit OTP is valid and unexpired
 * 3. action=reset_password: Verifies OTP, updates password in `users` table, invalidates OTP
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/mailer.php';

function sendJsonResponse(bool $success, string $message, array $extra = [], int $status = 200): void {
    http_response_code($status);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $extra));
    exit;
}

// Clean phone helper
function cleanPhone(string $phone): string {
    $digits = preg_replace('/\D/', '', $phone);
    if (strlen($digits) > 10 && substr($digits, 0, 2) === '91') {
        $digits = substr($digits, 2);
    }
    return $digits;
}

// Rigorous email validation checking for missing, empty, malformed, or placeholder emails
function validateAccountEmail(?string $email): bool {
    if (empty($email)) {
        return false;
    }
    $email = trim($email);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        return false;
    }
    $lower = strtolower($email);
    $flawedPatterns = ['example.com', 'test.com', 'dummy', 'none.com', 'temp.com', 'noemail', 'null', 'undefined'];
    foreach ($flawedPatterns as $flaw) {
        if (strpos($lower, $flaw) !== false) {
            return false;
        }
    }
    $parts = explode('@', $email);
    if (count($parts) !== 2 || strpos($parts[1], '.') === false) {
        return false;
    }
    return true;
}

// Mask email for user privacy: "rahulsharma@gmail.com" -> "ra*****ma@gmail.com"
function maskEmail(string $email): string {
    $parts = explode('@', $email);
    $name = $parts[0];
    $domain = $parts[1] ?? '';
    $len = strlen($name);
    if ($len <= 2) {
        $maskedName = substr($name, 0, 1) . '*';
    } else {
        $maskedName = substr($name, 0, 2) . str_repeat('*', max(3, $len - 3)) . substr($name, -1);
    }
    return $maskedName . '@' . $domain;
}

// Read raw JSON or POST data
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);
if (!is_array($input)) {
    $input = $_POST;
}

$action = trim($input['action'] ?? $_GET['action'] ?? 'send_otp');

// =========================================================================
// ACTION 1: SEND OTP
// =========================================================================
if ($action === 'send_otp') {
    $identifier = trim($input['identifier'] ?? $input['phone'] ?? $input['email'] ?? $input['username'] ?? '');

    if (empty($identifier)) {
        sendJsonResponse(false, 'Please enter your registered phone number or email address.', [], 400);
    }

    $cleanPhone = cleanPhone($identifier);

    // 1. Search in `users` table
    $uQuery = "SELECT id, username, full_name, email, phone_number, role, status FROM users 
               WHERE phone_number = ? OR phone_number = ? OR email = ? OR username = ? LIMIT 1";
    $uStmt = mysqli_prepare($connection1, $uQuery);
    $userRecord = null;
    if ($uStmt) {
        mysqli_stmt_bind_param($uStmt, "ssss", $identifier, $cleanPhone, $identifier, $identifier);
        mysqli_stmt_execute($uStmt);
        $uRes = mysqli_stmt_get_result($uStmt);
        $userRecord = mysqli_fetch_assoc($uRes);
        mysqli_stmt_close($uStmt);
    }

    // Do not permit staff/doctor/admin through patient password reset
    if ($userRecord) {
        $role = strtolower(trim((string)($userRecord['role'] ?? '')));
        if ($role === 'admin' || $role === 'super admin' || $role === 'doctor' || $role === 'staff') {
            sendJsonResponse(false, 'Invalid credentials. Please check your registered details.', [], 401);
        }
    }

    // 2. Search in `patients` table
    $pQuery = "SELECT id, patient_id, full_name, email, phone_number, status FROM patients 
               WHERE phone_number = ? OR phone_number = ? OR email = ? LIMIT 1";
    $pStmt = mysqli_prepare($connection1, $pQuery);
    $patientRecord = null;
    if ($pStmt) {
        mysqli_stmt_bind_param($pStmt, "sss", $identifier, $cleanPhone, $identifier);
        mysqli_stmt_execute($pStmt);
        $pRes = mysqli_stmt_get_result($pStmt);
        $patientRecord = mysqli_fetch_assoc($pRes);
        mysqli_stmt_close($pStmt);
    }

    if (!$userRecord && !$patientRecord) {
        sendJsonResponse(false, 'No patient account found with this phone number or email.', [], 404);
    }

    // Check account status
    $status = $userRecord['status'] ?? $patientRecord['status'] ?? 'Active';
    if (strtolower($status) === 'inactive') {
        sendJsonResponse(false, 'Your account is currently inactive. Please contact support.', [], 403);
    }

    // Determine target email
    $patientEmail = trim($userRecord['email'] ?? $patientRecord['email'] ?? '');
    $patientName = htmlspecialchars($userRecord['full_name'] ?? $patientRecord['full_name'] ?? 'Patient');
    $userId = (int)($userRecord['id'] ?? $patientRecord['id'] ?? 0);

    // Requirement: Check if email is missing or has a flaw
    if (!validateAccountEmail($patientEmail)) {
        sendJsonResponse(
            false,
            'Your patient account does not have a valid registered email address. Please contact the administrator to reset your password.',
            ['has_email_flaw' => true],
            400
        );
    }

    // Generate secure 6-digit numeric OTP
    $otp = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
    $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));

    // Invalidate previous unused OTPs for this patient
    $invStmt = mysqli_prepare($connection1, "UPDATE password_reset_otps SET is_used = 1 WHERE user_type = 'patient' AND email = ? AND is_used = 0");
    if ($invStmt) {
        mysqli_stmt_bind_param($invStmt, "s", $patientEmail);
        mysqli_stmt_execute($invStmt);
        mysqli_stmt_close($invStmt);
    }

    // Store new OTP
    $insStmt = mysqli_prepare($connection1, "INSERT INTO password_reset_otps (user_type, user_id, email, otp_code, expires_at, is_used) VALUES ('patient', ?, ?, ?, ?, 0)");
    if (!$insStmt) {
        sendJsonResponse(false, 'Failed to generate OTP: ' . mysqli_error($connection1), [], 500);
    }
    mysqli_stmt_bind_param($insStmt, "isss", $userId, $patientEmail, $otp, $expiresAt);
    mysqli_stmt_execute($insStmt);
    mysqli_stmt_close($insStmt);

    // Send email via Gmail SMTP
    $smtpConfig = require __DIR__ . '/smtp_config.php';
    $mailer = new SimpleSmtpMailer($smtpConfig);

    $subject = "Your Password Reset OTP - Ocayur Patient Portal";
    $htmlContent = "
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset='UTF-8'>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
            .card { max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header { text-align: center; margin-bottom: 24px; }
            .brand { color: #14532d; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
            .badge { display: inline-block; background: #dcfce7; color: #166534; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; margin-top: 6px; }
            .otp-box { background: #f0fdf4; border: 2px dashed #86efac; border-radius: 12px; text-align: center; padding: 20px; margin: 28px 0; }
            .otp-code { font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #15803d; margin: 0; font-family: monospace; }
            .otp-hint { font-size: 13px; color: #64748b; margin-top: 8px; }
            .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
        </style>
    </head>
    <body>
        <div class='card'>
            <div class='header'>
                <div class='brand'>🌿 Ocayur Patient Portal</div>
                <div class='badge'>Secure Account Verification</div>
            </div>
            <p>Hello <strong>{$patientName}</strong>,</p>
            <p>You requested to reset your password. Use the 6-digit OTP code below to verify your account and set a new password:</p>
            
            <div class='otp-box'>
                <div class='otp-code'>{$otp}</div>
                <div class='otp-hint'>Valid for 10 minutes. Please do not share this OTP with anyone.</div>
            </div>

            <p style='font-size: 14px; color: #475569;'>If you did not request this password reset, please disregard this email.</p>
            
            <div class='footer'>
                © " . date('Y') . " Ocayur Healthcare. All rights reserved.
            </div>
        </div>
    </body>
    </html>";

    $mailError = null;
    $sent = $mailer->send($patientEmail, $subject, $htmlContent, $mailError);

    if (!$sent) {
        sendJsonResponse(false, 'Unable to send OTP email at this moment. ' . ($mailError ? '(' . $mailError . ')' : 'Please contact admin.'), [
            'mail_error' => $mailError
        ], 500);
    }

    sendJsonResponse(true, 'A 6-digit verification code has been sent to your registered email.', [
        'email' => $patientEmail,
        'masked_email' => maskEmail($patientEmail),
        'expires_in_minutes' => 10
    ]);
}

// =========================================================================
// ACTION 2: VERIFY OTP
// =========================================================================
if ($action === 'verify_otp') {
    $email = trim($input['email'] ?? '');
    $otp = trim($input['otp'] ?? $input['otp_code'] ?? '');

    if (empty($email) || empty($otp)) {
        sendJsonResponse(false, 'Email and OTP code are required.', [], 400);
    }

    $vStmt = mysqli_prepare($connection1, "SELECT id FROM password_reset_otps 
              WHERE user_type = 'patient' AND email = ? AND otp_code = ? AND is_used = 0 AND expires_at >= NOW() 
              ORDER BY id DESC LIMIT 1");
    if (!$vStmt) {
        sendJsonResponse(false, 'Database error: ' . mysqli_error($connection1), [], 500);
    }
    mysqli_stmt_bind_param($vStmt, "ss", $email, $otp);
    mysqli_stmt_execute($vStmt);
    $res = mysqli_stmt_get_result($vStmt);
    $record = mysqli_fetch_assoc($res);
    mysqli_stmt_close($vStmt);

    if (!$record) {
        sendJsonResponse(false, 'Invalid or expired OTP. Please check the code or request a new one.', [], 400);
    }

    sendJsonResponse(true, 'OTP verified successfully.', [
        'verified' => true
    ]);
}

// =========================================================================
// ACTION 3: RESET PASSWORD
// =========================================================================
if ($action === 'reset_password') {
    $email = trim($input['email'] ?? '');
    $otp = trim($input['otp'] ?? $input['otp_code'] ?? '');
    $newPassword = $input['new_password'] ?? $input['password'] ?? '';
    $confirmPassword = $input['confirm_password'] ?? '';

    if (empty($email) || empty($otp) || empty($newPassword)) {
        sendJsonResponse(false, 'All fields (email, OTP, new password) are required.', [], 400);
    }

    if (strlen($newPassword) < 6) {
        sendJsonResponse(false, 'Password must be at least 6 characters long.', [], 400);
    }

    if (!empty($confirmPassword) && $newPassword !== $confirmPassword) {
        sendJsonResponse(false, 'Passwords do not match.', [], 400);
    }

    // Verify OTP
    $vStmt = mysqli_prepare($connection1, "SELECT id, user_id FROM password_reset_otps 
              WHERE user_type = 'patient' AND email = ? AND otp_code = ? AND is_used = 0 AND expires_at >= NOW() 
              ORDER BY id DESC LIMIT 1");
    if (!$vStmt) {
        sendJsonResponse(false, 'Database error: ' . mysqli_error($connection1), [], 500);
    }
    mysqli_stmt_bind_param($vStmt, "ss", $email, $otp);
    mysqli_stmt_execute($vStmt);
    $res = mysqli_stmt_get_result($vStmt);
    $otpRecord = mysqli_fetch_assoc($res);
    mysqli_stmt_close($vStmt);

    if (!$otpRecord) {
        sendJsonResponse(false, 'Invalid or expired OTP session. Please request a new verification code.', [], 400);
    }

    $otpId = (int)$otpRecord['id'];
    $userId = (int)$otpRecord['user_id'];
    $hashedPassword = password_hash($newPassword, PASSWORD_BCRYPT);

    // Update in `users` table
    $upUser = mysqli_prepare($connection1, "UPDATE users SET password_hash = ? WHERE email = ? OR id = ?");
    $updated = false;
    if ($upUser) {
        mysqli_stmt_bind_param($upUser, "ssi", $hashedPassword, $email, $userId);
        mysqli_stmt_execute($upUser);
        if (mysqli_stmt_affected_rows($upUser) > 0) {
            $updated = true;
        }
        mysqli_stmt_close($upUser);
    }

    // If patient only existed in `patients` table and had no row in `users`, create user record
    if (!$updated) {
        $findP = mysqli_prepare($connection1, "SELECT id, full_name, phone_number, email FROM patients WHERE email = ? OR id = ? LIMIT 1");
        if ($findP) {
            mysqli_stmt_bind_param($findP, "si", $email, $userId);
            mysqli_stmt_execute($findP);
            $pRes = mysqli_stmt_get_result($findP);
            $pat = mysqli_fetch_assoc($pRes);
            mysqli_stmt_close($findP);

            if ($pat) {
                $username = !empty($pat['phone_number']) ? $pat['phone_number'] : ('patient_' . $pat['id']);
                $insUser = mysqli_prepare($connection1, "INSERT INTO users (username, full_name, email, phone_number, password_hash, role, status) VALUES (?, ?, ?, ?, ?, 'Patient', 'Active')");
                if ($insUser) {
                    mysqli_stmt_bind_param($insUser, "sssss", $username, $pat['full_name'], $pat['email'], $pat['phone_number'], $hashedPassword);
                    mysqli_stmt_execute($insUser);
                    mysqli_stmt_close($insUser);
                }
            }
        }
    }

    // Mark OTP as used
    $useStmt = mysqli_prepare($connection1, "UPDATE password_reset_otps SET is_used = 1 WHERE id = ?");
    if ($useStmt) {
        mysqli_stmt_bind_param($useStmt, "i", $otpId);
        mysqli_stmt_execute($useStmt);
        mysqli_stmt_close($useStmt);
    }

    sendJsonResponse(true, 'Your password has been reset successfully. You can now log in with your new password.');
}

sendJsonResponse(false, 'Invalid action specified.', [], 400);
