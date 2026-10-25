<?php
/**
 * Ocayur Patient Portal - Dashboard Notifications API
 * Endpoint: /api/dashboard_notifications.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($requestMethod === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';

function sendNotifResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function notifTableExists($connection, $table) {
    static $cache = [];
    if (!$connection || !preg_match('/^[A-Za-z0-9_]+$/', $table)) return false;
    if (isset($cache[$table])) return $cache[$table];
    $tableEscaped = mysqli_real_escape_string($connection, $table);
    $res = mysqli_query($connection, "SHOW TABLES LIKE '{$tableEscaped}'");
    $exists = ($res && mysqli_num_rows($res) > 0);
    $cache[$table] = $exists;
    return $exists;
}

function resolveNotifPatient($connection, $phone, $email, $patientId) {
    if (!$connection) return null;

    $phoneDigits = preg_replace('/\D+/', '', $phone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }
    $phoneWith91 = '91' . $phoneDigits;
    $phoneWithPlus91 = '+91' . $phoneDigits;
    $numericId = is_numeric($patientId) ? (int)$patientId : 0;

    if ($phone === '' && $phoneDigits === '' && $email === '' && $patientId === '' && $numericId <= 0) {
        return null;
    }

    $sql = "SELECT id, patient_id, full_name, phone_number, email
            FROM patients
            WHERE (phone_number <> '' AND (phone_number = ? OR phone_number = ? OR phone_number = ? OR phone_number = ?))
               OR (email <> '' AND email = ?)
               OR (patient_id <> '' AND patient_id = ?)
               OR (? > 0 AND id = ?)
            LIMIT 1";

    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) return null;

    mysqli_stmt_bind_param($stmt, 'ssssssii', $phone, $phoneDigits, $phoneWith91, $phoneWithPlus91, $email, $patientId, $numericId, $numericId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $patient = mysqli_fetch_assoc($result) ?: null;
    mysqli_stmt_close($stmt);

    return $patient;
}

try {
    $sessionPhone = trim((string)($_SESSION['phone_number'] ?? $_SESSION['phone'] ?? ''));
    $sessionPatientId = trim((string)($_SESSION['patient_id'] ?? ''));
    $sessionEmail = trim((string)($_SESSION['email'] ?? ''));

    $phone = trim((string)($_GET['phone'] ?? $sessionPhone));
    $email = trim((string)($_GET['email'] ?? $sessionEmail));
    $patientId = trim((string)($_GET['patient_id'] ?? $sessionPatientId));

    $patient = resolveNotifPatient($connection1, $phone, $email, $patientId);

    if (!$patient) {
        sendNotifResponse(false, 'Patient record not found.', ['notifications' => []], 200);
    }

    $patientDbId = (int)$patient['id'];
    $notifications = [];

    if (notifTableExists($connection1, 'appointments')) {
        $sql = "SELECT id, appointment_id, doctor_name, appointment_date, appointment_time,
                       service_type, agenda, status, created_at
                FROM appointments
                WHERE patient_id = ?
                ORDER BY id DESC
                LIMIT 10";

        $stmt = mysqli_prepare($connection1, $sql);
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'i', $patientDbId);
            mysqli_stmt_execute($stmt);
            $result = mysqli_stmt_get_result($stmt);

            while ($row = mysqli_fetch_assoc($result)) {
                $date = !empty($row['appointment_date']) ? date('j F Y', strtotime($row['appointment_date'])) : '';
                $time = !empty($row['appointment_time']) ? date('g:i A', strtotime($row['appointment_time'])) : '';
                $createdAt = !empty($row['created_at']) ? strtotime($row['created_at']) : false;
                $ago = '';

                if ($createdAt) {
                    $diff = max(0, time() - $createdAt);
                    if ($diff >= 86400) {
                        $days = floor($diff / 86400);
                        $ago = $days . ' Day' . ($days > 1 ? 's' : '') . ' Ago';
                    } elseif ($diff >= 3600) {
                        $hours = floor($diff / 3600);
                        $ago = $hours . ' Hour' . ($hours > 1 ? 's' : '') . ' Ago';
                    } elseif ($diff >= 60) {
                        $mins = floor($diff / 60);
                        $ago = $mins . ' Mins Ago';
                    } else {
                        $ago = 'Just Now';
                    }
                }

                $doctor = trim((string)($row['doctor_name'] ?? ''));
                $notifications[] = [
                    'id' => (int)$row['id'],
                    'appointment_id' => $row['appointment_id'] ?? '',
                    'title' => 'Appointment' . (!empty($row['status']) ? ' - ' . $row['status'] : ''),
                    'description' => $doctor !== '' ? 'Consultation with ' . $doctor : ($row['service_type'] ?? ''),
                    'datetime' => trim($date . ($time !== '' ? ' - ' . $time : '')),
                    'time_ago' => $ago
                ];
            }
            mysqli_stmt_close($stmt);
        }
    }

    sendNotifResponse(true, 'Notifications loaded successfully.', [
        'notifications' => $notifications
    ]);

} catch (Throwable $e) {
    sendNotifResponse(false, 'Error loading notifications: ' . $e->getMessage(), ['notifications' => []], 200);
}
