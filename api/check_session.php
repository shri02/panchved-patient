<?php
/**
 * Ocayur Patient Portal - Check Session API
 * Returns active user & patient session details.
 */

set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) {
        return false;
    }
    throw new \ErrorException($errstr, 0, $errno, $errfile, $errline);
});

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

$reqMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($reqMethod === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    if (session_status() === PHP_SESSION_NONE) {
        @session_start();
    }

    require_once __DIR__ . '/database.php';

    // Auto-restore patient session from remember-me cookie if session is expired
    if ((empty($_SESSION['user_id']) && empty($_SESSION['phone_number'])) && !empty($_COOKIE['ocayur_patient_remember'])) {
        $salt = 'ocayur_patient_remember_salt_2026';
        $parts = explode(':', $_COOKIE['ocayur_patient_remember'], 3);
        if (count($parts) === 3) {
            $cookiePatId = (int)$parts[0];
            $cookieExpiry = (int)$parts[1];
            $cookieSig = $parts[2];

            if ($cookieExpiry > time() && $cookiePatId > 0 && isset($connection1) && $connection1) {
                $remStmt = mysqli_prepare($connection1, "SELECT id, username, full_name, email, phone_number, role, status FROM users WHERE id = ? LIMIT 1");
                mysqli_stmt_bind_param($remStmt, "i", $cookiePatId);
                mysqli_stmt_execute($remStmt);
                $remRes = mysqli_stmt_get_result($remStmt);
                $uFromCookie = mysqli_fetch_assoc($remRes);
                mysqli_stmt_close($remStmt);

                if ($uFromCookie && (empty($uFromCookie['status']) || strtolower($uFromCookie['status']) !== 'inactive')) {
                    $expectedSig = hash_hmac('sha256', $cookiePatId . '|' . $cookieExpiry . '|' . ($uFromCookie['phone_number'] ?? ''), $salt);
                    if (hash_equals($expectedSig, $cookieSig)) {
                        $role = strtolower(trim((string)($uFromCookie['role'] ?? 'patient')));
                        if ($role === 'patient' || $role === '') {
                            $_SESSION['user_id'] = $uFromCookie['id'];
                            $_SESSION['username'] = $uFromCookie['username'];
                            $_SESSION['full_name'] = $uFromCookie['full_name'];
                            $_SESSION['phone_number'] = $uFromCookie['phone_number'];
                            $_SESSION['email'] = $uFromCookie['email'];
                            $_SESSION['role'] = $uFromCookie['role'] ?? 'Patient';
                        }
                    }
                }
            }
        }
    }

    $sessionRole = strtolower(trim((string)($_SESSION['role'] ?? 'patient')));
    if ((empty($_SESSION['user_id']) && empty($_SESSION['phone_number'])) || ($sessionRole !== 'patient' && !empty($_SESSION['role']))) {
        http_response_code(200);
        echo json_encode([
            'authenticated' => false,
            'message' => 'No active patient session found.'
        ]);
        exit;
    }

    $phone = $_SESSION['phone_number'] ?? '';
    $userId = $_SESSION['user_id'] ?? 0;
    $sessionPatientId = $_SESSION['patient_id'] ?? '';
    $sessionEmail = $_SESSION['email'] ?? '';

    $phoneDigits = preg_replace('/[^\d]/', '', $phone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    $patient = null;
    if (!empty($phone) || !empty($phoneDigits) || !empty($sessionPatientId) || !empty($sessionEmail)) {
        $pQuery = "SELECT id, patient_id, full_name, dob, age, phone_number, gender, email, package_name, total_appointments, status FROM patients WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) OR (patient_id != '' AND patient_id = ?) OR (email != '' AND email = ?) LIMIT 1";
        if ($stmt = mysqli_prepare($connection1, $pQuery)) {
            mysqli_stmt_bind_param($stmt, "ssss", $phone, $phoneDigits, $sessionPatientId, $sessionEmail);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $patient = mysqli_fetch_assoc($res);
            mysqli_stmt_close($stmt);
        }
    }

    echo json_encode([
        'authenticated' => true,
        'user' => [
            'id' => (int)$userId,
            'username' => $_SESSION['username'] ?? $phone,
            'full_name' => $_SESSION['full_name'] ?? ($patient['full_name'] ?? 'Patient User'),
            'email' => $_SESSION['email'] ?? ($patient['email'] ?? ''),
            'phone_number' => $phone,
            'role' => $_SESSION['role'] ?? 'Patient'
        ],
        'patient' => $patient ? $patient : [
            'patient_id' => $_SESSION['patient_id'] ?? ('P00' . $userId),
            'full_name' => $_SESSION['full_name'] ?? 'Patient',
            'phone_number' => $phone,
            'status' => 'Ongoing'
        ]
    ]);

} catch (mysqli_sql_exception $e) {
    http_response_code(200);
    echo json_encode([
        'authenticated' => false,
        'success' => false,
        'message' => 'Database Error: ' . $e->getMessage(),
        'error_type' => 'mysqli_sql_exception',
        'error_code' => $e->getCode(),
        'sqlstate' => method_exists($e, 'getSqlState') ? $e->getSqlState() : null,
        'error_details' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    http_response_code(200);
    echo json_encode([
        'authenticated' => false,
        'success' => false,
        'message' => 'Server Error: ' . $e->getMessage(),
        'error_type' => get_class($e),
        'error_code' => $e->getCode(),
        'sqlstate' => null,
        'error_details' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
?>