<?php
/**
 * Ocayur Patient Portal - Check Session API
 * Returns active user & patient session details.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';

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

$patient = null;
if (!empty($phone)) {
    $pQuery = "SELECT id, patient_id, full_name, dob, age, phone_number, gender, email, package_name, total_appointments, status FROM patients WHERE phone_number = ? LIMIT 1";
    if ($stmt = mysqli_prepare($connection1, $pQuery)) {
        mysqli_stmt_bind_param($stmt, "s", $phone);
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
