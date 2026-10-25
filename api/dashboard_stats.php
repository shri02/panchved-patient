<?php
/**
 * Ocayur Patient Portal - Dashboard Stats & Package Overview API
 * Endpoint: /api/dashboard_stats.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

require_once __DIR__ . '/database.php';

function sendStatsResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function statsTableExists($connection, $table) {
    static $cache = [];
    if (!$connection || !preg_match('/^[A-Za-z0-9_]+$/', $table)) return false;
    if (isset($cache[$table])) return $cache[$table];
    $tableEscaped = mysqli_real_escape_string($connection, $table);
    $res = mysqli_query($connection, "SHOW TABLES LIKE '{$tableEscaped}'");
    $exists = ($res && mysqli_num_rows($res) > 0);
    $cache[$table] = $exists;
    return $exists;
}

function resolveStatsPatient($connection, $phone, $email, $patientId) {
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

    $sql = "SELECT id, patient_id, patient_profile, full_name, dob, age, height, weight, phone_number, gender, email,
                   blood_group, emergency_contact, address, package_name,
                   total_appointments, status, created_at, updated_at
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

function getStatsPackageDetails($connection, $packageName) {
    if (!$connection || $packageName === '' || !statsTableExists($connection, 'packages')) {
        return null;
    }

    $sql = "SELECT * FROM packages WHERE package_name = ? OR package_name LIKE ? LIMIT 1";
    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) return null;

    $like = '%' . $packageName . '%';
    mysqli_stmt_bind_param($stmt, 'ss', $packageName, $like);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $package = mysqli_fetch_assoc($result) ?: null;
    mysqli_stmt_close($stmt);

    return $package;
}

function calculateStatsPackageProgress($patient, $package) {
    if (!$patient || empty($patient['package_name'])) {
        return null;
    }

    $startDate = !empty($patient['created_at']) && $patient['created_at'] !== '0000-00-00 00:00:00'
        ? strtotime($patient['created_at'])
        : false;

    $durationText = trim((string)($package['duration'] ?? ''));
    $durationDays = null;

    if ($durationText !== '' && preg_match('/(\d+(?:\.\d+)?)\s*(day|days|week|weeks|month|months)/i', $durationText, $m)) {
        $amount = (float)$m[1];
        $unit = strtolower($m[2]);

        if (strpos($unit, 'day') !== false) {
            $durationDays = (int)round($amount);
        } elseif (strpos($unit, 'week') !== false) {
            $durationDays = (int)round($amount * 7);
        } else {
            $durationDays = (int)round($amount * 30);
        }
    }

    $percent = 0;
    $weekInfo = '';

    if ($startDate && $durationDays > 0) {
        $elapsedDays = max(0, (int)floor((time() - $startDate) / 86400));
        $percent = min(100, round(($elapsedDays / $durationDays) * 100));
        $currentWeek = max(1, (int)floor($elapsedDays / 7) + 1);
        $totalWeeks = max(1, (int)ceil($durationDays / 7));
        $weekInfo = "Week {$currentWeek} of {$totalWeeks}";
    }

    $startDateFormatted = $startDate ? date('j F Y', $startDate) : '';

    return [
        'package_name' => $patient['package_name'],
        'start_date' => $startDateFormatted,
        'progress_percent' => $percent,
        'progress_text' => $percent > 0 ? $percent . ' %' : '',
        'week_info' => $weekInfo,
        'duration' => $package['duration'] ?? '',
        'short_description' => $package['short_description'] ?? '',
        'diet_hydration' => $package['diet_hydration'] ?? '',
        'diet_plan' => [
            'package_name' => $package['package_name'] ?? $patient['package_name'],
            'category' => $package['category'] ?? '',
            'diet_hydration' => $package['diet_hydration'] ?? '',
            'dinacharya' => $package['ayurveda_dinacharya'] ?? '',
            'overview' => $package['overview'] ?? '',
            'benefits' => $package['benefits'] ?? '',
            'paragraph_1' => trim(($package['diet_hydration'] ?? '') . ' ' . ($package['overview'] ?? '')),
            'paragraph_2' => trim(($package['ayurveda_dinacharya'] ?? '') . ' ' . ($package['benefits'] ?? '')),
            'paragraphs' => [
                trim(($package['diet_hydration'] ?? '') . ' ' . ($package['overview'] ?? '')),
                trim(($package['ayurveda_dinacharya'] ?? '') . ' ' . ($package['benefits'] ?? ''))
            ]
        ]
    ];
}

try {
    $sessionPhone = trim((string)($_SESSION['phone_number'] ?? $_SESSION['phone'] ?? ''));
    $sessionPatientId = trim((string)($_SESSION['patient_id'] ?? ''));
    $sessionEmail = trim((string)($_SESSION['email'] ?? ''));

    $phone = trim((string)($_GET['phone'] ?? $sessionPhone));
    $email = trim((string)($_GET['email'] ?? $sessionEmail));
    $patientId = trim((string)($_GET['patient_id'] ?? $sessionPatientId));

    $patient = resolveStatsPatient($connection1, $phone, $email, $patientId);

    if (!$patient) {
        sendStatsResponse(false, 'Patient record not found.', [
            'patient' => null,
            'stats' => [
                'upcoming_consultations' => 0,
                'active_packages' => 0,
                'unread_messages' => 0
            ],
            'my_package' => null
        ], 200);
    }

    $patientDbId = (int)$patient['id'];
    $currentPackageName = trim((string)($patient['package_name'] ?? ''));

    $package = getStatsPackageDetails($connection1, $currentPackageName);
    $packageProgress = calculateStatsPackageProgress($patient, $package);

    // 1. Upcoming consultations count
    $upcomingCount = 0;
    if (statsTableExists($connection1, 'appointments')) {
        $stmt = mysqli_prepare($connection1, "SELECT COUNT(*) AS count FROM appointments WHERE patient_id = ? AND status IN ('Scheduled', 'Upcoming')");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'i', $patientDbId);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $row = mysqli_fetch_assoc($res);
            $upcomingCount = (int)($row['count'] ?? 0);
            mysqli_stmt_close($stmt);
        }
    }

    // 2. Active packages count
    $activePackagesCount = 0;
    if ($currentPackageName !== '') {
        $status = strtolower(trim((string)($patient['status'] ?? '')));
        if ($status === '' || in_array($status, ['active', 'ongoing', 'scheduled'], true)) {
            $activePackagesCount = 1;
        }
    }

    // 3. Unread messages count
    $unreadMessagesCount = 0;
    if (statsTableExists($connection1, 'chat_messages')) {
        $stmt = mysqli_prepare($connection1, "SELECT COUNT(*) AS count FROM chat_messages WHERE patient_id = ? AND sender_type = 'doctor' AND is_seen = 0");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'i', $patientDbId);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $row = mysqli_fetch_assoc($res);
            $unreadMessagesCount = (int)($row['count'] ?? 0);
            mysqli_stmt_close($stmt);
        }
    }

    sendStatsResponse(true, 'Stats loaded successfully.', [
        'patient' => [
            'id' => $patientDbId,
            'patient_id' => $patient['patient_id'] ?? '',
            'full_name' => $patient['full_name'] ?? '',
            'phone_number' => $patient['phone_number'] ?? '',
            'email' => $patient['email'] ?? '',
            'package_name' => $currentPackageName,
            'status' => $patient['status'] ?? ''
        ],
        'stats' => [
            'upcoming_consultations' => $upcomingCount,
            'active_packages' => $activePackagesCount,
            'unread_messages' => $unreadMessagesCount
        ],
        'my_package' => $packageProgress
    ]);

} catch (Throwable $e) {
    sendStatsResponse(false, 'Error loading stats: ' . $e->getMessage(), [
        'patient' => null,
        'stats' => [
            'upcoming_consultations' => 0,
            'active_packages' => 0,
            'unread_messages' => 0
        ],
        'my_package' => null
    ], 200);
}
