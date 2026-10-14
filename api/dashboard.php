<?php
/**
 * Ocayur Patient Portal - Dashboard API
 *
 * Dashboard data is read from MySQL only.
 * No demo/fallback patient, package, health or notification records are created.
 *
 * GET:
 *   dashboard.php
 *   dashboard.php?action=get_dashboard
 *   dashboard.php?action=view_diet
 *
 * POST:
 *   dashboard.php
 *   { "action":"add_reading", "date":"YYYY-MM-DD",
 *     "weight":..., "abdomen":..., "bp":"120/80", "sugar":... }
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

function sendJsonResponse($success, $message, $data = [], $statusCode = 200)
{
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function tableExists($connection, $table)
{
    if (!$connection || !preg_match('/^[A-Za-z0-9_]+$/', $table)) {
        return false;
    }

    $tableEscaped = mysqli_real_escape_string($connection, $table);
    $result = mysqli_query(
        $connection,
        "SELECT 1 FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_name = '{$tableEscaped}' LIMIT 1"
    );

    return $result && mysqli_num_rows($result) > 0;
}

function getMetricDateLabel($dateStr)
{
    $time = strtotime($dateStr);
    if (!$time) {
        return '';
    }

    $start = strtotime('monday this week', $time);
    $end = strtotime('+6 days', $start);

    if (date('M', $start) === date('M', $end)) {
        return date('d', $start) . '-' . date('d M', $end);
    }

    return date('d M', $start) . '-' . date('d M', $end);
}

function formatNumber($value)
{
    if ($value === null || $value === '') {
        return null;
    }

    $number = (float)$value;
    return floor($number) == $number ? (string)(int)$number : rtrim(rtrim(number_format($number, 2, '.', ''), '0'), '.');
}

function getLatestMetricsAndGraphs($connection, $patientId, $phone)
{
    $metrics = [
        'weight' => null,
        'weight_raw' => null,
        'abdomen' => null,
        'abdomen_raw' => null,
        'bp' => null,
        'sugar' => null,
        'sugar_raw' => null
    ];

    $graphs = [
        'weight' => [
            'label' => 'Weight',
            'unit' => 'kgs',
            'y_axis' => [100, 80, 60, 40, 20, 0],
            'max_val' => 100,
            'color_class' => 'bar-teal',
            'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ],
        'abdomen' => [
            'label' => 'Abdomen Girth',
            'unit' => 'cm',
            'y_axis' => [100, 80, 60, 40, 20, 0],
            'max_val' => 100,
            'color_class' => 'bar-plum',
            'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ],
        'bp' => [
            'label' => 'Blood Pressure',
            'unit' => 'mm Hg',
            'y_axis' => [150, 120, 90, 60, 30, 0],
            'max_val' => 150,
            'color_class' => 'bar-amber',
            'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ],
        'sugar' => [
            'label' => 'Blood Sugar',
            'unit' => 'mg/dL',
            'y_axis' => [125, 100, 75, 50, 25, 0],
            'max_val' => 125,
            'color_class' => 'bar-blue',
            'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ]
    ];

    if (!$connection || !$patientId && !$phone || !tableExists($connection, 'health_metrics')) {
        return ['latest' => $metrics, 'graphs' => $graphs];
    }

    $sql = "SELECT id, weight, abdomen, bp, sugar, recorded_date
            FROM health_metrics
            WHERE ((patient_id = ? AND ? > 0) OR (patient_phone = ? AND ? <> ''))
              AND recorded_date IS NOT NULL
              AND recorded_date <> '0000-00-00'
            ORDER BY recorded_date ASC, id ASC";

    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) {
        return ['latest' => $metrics, 'graphs' => $graphs];
    }

    mysqli_stmt_bind_param($stmt, 'iiss', $patientId, $patientId, $phone, $phone);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);

    $readings = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $readings[] = $row;
    }
    mysqli_stmt_close($stmt);

    // Resolve latest non-null reading for each metric individually
    for ($i = count($readings) - 1; $i >= 0; $i--) {
        $row = $readings[$i];
        if ($metrics['weight'] === null && $row['weight'] !== null && $row['weight'] !== '') {
            $v = (float)$row['weight'];
            $metrics['weight_raw'] = $v;
            $metrics['weight'] = formatNumber($v) . ' kgs';
        }

        if ($metrics['abdomen'] === null && $row['abdomen'] !== null && $row['abdomen'] !== '') {
            $v = (float)$row['abdomen'];
            $metrics['abdomen_raw'] = $v;
            $metrics['abdomen'] = formatNumber($v) . ' cm';
        }

        if ($metrics['bp'] === null && $row['bp'] !== null && trim($row['bp']) !== '') {
            $metrics['bp'] = trim($row['bp']) . (stripos($row['bp'], 'mm') === false ? ' mm Hg' : '');
        }

        if ($metrics['sugar'] === null && $row['sugar'] !== null && $row['sugar'] !== '') {
            $v = (float)$row['sugar'];
            $metrics['sugar_raw'] = $v;
            $metrics['sugar'] = formatNumber($v) . ' mg/dL';
        }
    }

    $ranges = [
        '6w' => strtotime('-6 weeks'),
        '3m' => strtotime('-3 months'),
        '6m' => strtotime('-6 months')
    ];
    $maxFuture = strtotime('+1 day 23:59:59');

    foreach ($readings as $row) {
        $timestamp = strtotime($row['recorded_date']);
        if (!$timestamp) {
            continue;
        }

        $dateLabel = getMetricDateLabel($row['recorded_date']);

        foreach (['weight', 'abdomen', 'sugar'] as $metric) {
            if ($row[$metric] === null || $row[$metric] === '') {
                continue;
            }

            $value = (float)$row[$metric];

            if ($metric === 'weight') {
                $max = 100;
            } elseif ($metric === 'abdomen') {
                $max = 100;
            } else {
                $max = 125;
            }

            $item = [
                'date_label' => $dateLabel,
                'val_label' => formatNumber($value),
                'height_percent' => min(100, max(5, round(($value / $max) * 100, 1))),
                'value' => $value,
                'date' => $row['recorded_date']
            ];

            foreach ($ranges as $timeframe => $start) {
                if ($timestamp >= $start && $timestamp <= $maxFuture) {
                    $graphs[$metric]['timeframes'][$timeframe][] = $item;
                }
            }
        }

        if ($row['bp'] !== null && trim($row['bp']) !== '') {
            $bp = trim($row['bp']);
            $systolic = 0;
            if (preg_match('/^(\d{2,3})\s*\/\s*(\d{2,3})/', $bp, $match)) {
                $systolic = (int)$match[1];
            } elseif (preg_match('/^(\d{2,3})/', $bp, $match)) {
                $systolic = (int)$match[1];
            }

            $item = [
                'date_label' => $dateLabel,
                'val_label' => $bp,
                'height_percent' => $systolic > 0 ? min(100, max(5, round(($systolic / 150) * 100, 1))) : 0,
                'value' => $bp,
                'date' => $row['recorded_date']
            ];

            foreach ($ranges as $timeframe => $start) {
                if ($timestamp >= $start && $timestamp <= $maxFuture) {
                    $graphs['bp']['timeframes'][$timeframe][] = $item;
                }
            }
        }
    }

    foreach ($graphs as $key => &$graph) {
        foreach ($graph['timeframes'] as &$dataset) {
            // Keep only the most recent 12 readings per chart.
            if (count($dataset) > 12) {
                $dataset = array_slice($dataset, -12);
            }
        }
    }
    unset($graph, $dataset);

    $graphs['weight']['latest'] = $metrics['weight'];
    $graphs['abdomen']['latest'] = $metrics['abdomen'];
    $graphs['bp']['latest'] = $metrics['bp'];
    $graphs['sugar']['latest'] = $metrics['sugar'];

    return ['latest' => $metrics, 'graphs' => $graphs];
}

function resolvePatient($connection, $phone, $email, $patientId)
{
    if (!$connection) {
        return null;
    }

    $phoneDigits = preg_replace('/\D+/', '', $phone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    if ($phone === '' && $phoneDigits === '' && $email === '' && $patientId === '') {
        return null;
    }

    $sql = "SELECT id, patient_id, patient_profile, full_name, dob, age, height, weight, phone_number, gender, email,
                   blood_group, emergency_contact, address, package_name,
                   total_appointments, status, created_at, updated_at
            FROM patients
            WHERE (phone_number <> '' AND (phone_number = ? OR phone_number = ?))
               OR (email <> '' AND email = ?)
               OR (patient_id <> '' AND patient_id = ?)
            LIMIT 1";

    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) {
        return null;
    }

    mysqli_stmt_bind_param($stmt, 'ssss', $phone, $phoneDigits, $email, $patientId);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $patient = mysqli_fetch_assoc($result) ?: null;
    mysqli_stmt_close($stmt);

    return $patient;
}

function getPackageDetails($connection, $packageName)
{
    if (!$connection || $packageName === '' || !tableExists($connection, 'packages')) {
        return null;
    }

    $sql = "SELECT * FROM packages
            WHERE package_name = ? OR package_name LIKE ?
            LIMIT 1";

    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) {
        return null;
    }

    $like = '%' . $packageName . '%';
    mysqli_stmt_bind_param($stmt, 'ss', $packageName, $like);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);
    $package = mysqli_fetch_assoc($result) ?: null;
    mysqli_stmt_close($stmt);

    return $package;
}

function calculatePackageProgress($patient, $package)
{
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

function getNotifications($connection, $patient)
{
    if (!$connection || !$patient || !tableExists($connection, 'appointments')) {
        return [];
    }

    $patientDbId = (int)$patient['id'];
    $patientName = (string)($patient['full_name'] ?? '');

    $sql = "SELECT id, appointment_id, doctor_name, appointment_date, appointment_time,
                   service_type, agenda, status, created_at
            FROM appointments
            WHERE patient_id = ?
               OR (? <> '' AND (patient_name = ? OR patient_name LIKE ?))
            ORDER BY id DESC
            LIMIT 10";

    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) {
        return [];
    }

    $nameLike = '%' . $patientName . '%';
    mysqli_stmt_bind_param($stmt, 'isss', $patientDbId, $patientName, $patientName, $nameLike);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);

    $notifications = [];

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
    return $notifications;
}

function getUnreadMessagesCount($connection, $patient)
{
    if (!$connection || !$patient) {
        return 0;
    }

    // Use a notifications/messages table only when it exists.
    foreach (['notifications', 'messages'] as $table) {
        if (!tableExists($connection, $table)) {
            continue;
        }

        $patientId = (int)$patient['id'];

        $columnsResult = mysqli_query($connection, "SHOW COLUMNS FROM `{$table}`");
        if (!$columnsResult) {
            continue;
        }

        $columns = [];
        while ($column = mysqli_fetch_assoc($columnsResult)) {
            $columns[] = $column['Field'];
        }

        $patientColumn = in_array('patient_id', $columns, true) ? 'patient_id' : null;
        $readColumn = in_array('is_read', $columns, true) ? 'is_read' : (in_array('read_status', $columns, true) ? 'read_status' : null);

        if (!$patientColumn || !$readColumn) {
            continue;
        }

        $sql = "SELECT COUNT(*) AS count FROM `{$table}` WHERE `{$patientColumn}` = ? AND (`{$readColumn}` = 0 OR `{$readColumn}` = '0')";
        $stmt = mysqli_prepare($connection, $sql);

        if ($stmt) {
            mysqli_stmt_bind_param($stmt, 'i', $patientId);
            mysqli_stmt_execute($stmt);
            $result = mysqli_stmt_get_result($stmt);
            $row = mysqli_fetch_assoc($result);
            mysqli_stmt_close($stmt);
            return (int)($row['count'] ?? 0);
        }
    }

    return 0;
}

/* --------------------------------------------------------------------------
 * Resolve current patient from request/session.
 * -------------------------------------------------------------------------- */

$requestMethod = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if ($requestMethod === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!is_array($data)) {
        $data = $_POST;
    }

    $action = $data['action'] ?? 'add_reading';
}

$sessionPhone = trim((string)($_SESSION['phone_number'] ?? $_SESSION['phone'] ?? ''));
$sessionEmail = trim((string)($_SESSION['email'] ?? $_SESSION['email_id'] ?? ''));
$sessionPatientId = trim((string)($_SESSION['patient_id'] ?? ''));

if ($requestMethod === 'GET') {
    $phone = trim((string)($_GET['phone'] ?? $sessionPhone));
    $email = trim((string)($_GET['email'] ?? $sessionEmail));
    $patientId = trim((string)($_GET['patient_id'] ?? $sessionPatientId));
} else {
    $phone = trim((string)($data['phone'] ?? $sessionPhone));
    $email = trim((string)($data['email'] ?? $sessionEmail));
    $patientId = trim((string)($data['patient_id'] ?? $sessionPatientId));
}

$patient = resolvePatient($connection1, $phone, $email, $patientId);

if (!$patient) {
    sendJsonResponse(false, 'Authenticated patient record was not found.', [
        'patient' => null,
        'stats' => [
            'upcoming_consultations' => 0,
            'active_packages' => 0,
            'unread_messages' => 0
        ],
        'my_package' => null,
        'diet_plan' => null,
        'metrics' => [
            'weight' => null,
            'weight_raw' => null,
            'abdomen' => null,
            'abdomen_raw' => null,
            'bp' => null,
            'sugar' => null,
            'sugar_raw' => null
        ],
        'graphs' => [],
        'notifications' => []
    ], 404);
}

/* --------------------------------------------------------------------------
 * POST: save health reading
 * -------------------------------------------------------------------------- */

if ($requestMethod === 'POST' && in_array($action, ['add_reading', 'save_metrics'], true)) {
    if (!tableExists($connection1, 'health_metrics')) {
        $createTable = "CREATE TABLE IF NOT EXISTS `health_metrics` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `patient_id` INT DEFAULT NULL,
            `patient_phone` VARCHAR(20) DEFAULT NULL,
            `weight` DECIMAL(5,2) DEFAULT NULL,
            `abdomen` DECIMAL(5,2) DEFAULT NULL,
            `bp` VARCHAR(30) DEFAULT NULL,
            `sugar` DECIMAL(5,2) DEFAULT NULL,
            `recorded_date` DATE NOT NULL,
            `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (`id`),
            KEY `idx_metric_patient` (`patient_id`),
            KEY `idx_metric_phone` (`patient_phone`),
            KEY `idx_metric_date` (`recorded_date`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

        if (!mysqli_query($connection1, $createTable)) {
            sendJsonResponse(false, 'Unable to create health metrics table.', [], 500);
        }
    }

    $rawDate = trim((string)($data['date'] ?? ''));
    if ($rawDate !== '') {
        $parsedTime = strtotime($rawDate);
        $date = ($parsedTime !== false) ? date('Y-m-d', $parsedTime) : date('Y-m-d');
    } else {
        $date = date('Y-m-d');
    }

    $cleanNumber = static function ($value) {
        if ($value === null || $value === '') {
            return null;
        }

        $value = preg_replace('/[^\d.]/', '', (string)$value);
        return is_numeric($value) && (float)$value > 0 ? (float)$value : null;
    };

    $weight = $cleanNumber($data['weight'] ?? null);
    $abdomen = $cleanNumber($data['abdomen'] ?? null);
    $sugar = $cleanNumber($data['sugar'] ?? null);

    $rawBp = trim((string)($data['bp'] ?? ''));
    $bp = null;

    if ($rawBp !== '') {
        if (preg_match('/(\d{2,3})\s*\/\s*(\d{2,3})/', $rawBp, $match)) {
            $bp = $match[1] . '/' . $match[2];
        } else {
            $bp = $rawBp;
        }
    }

    if ($weight === null && $abdomen === null && $bp === null && $sugar === null) {
        sendJsonResponse(false, 'Please enter at least one health metric parameter.', [], 400);
    }

    $sql = "INSERT INTO health_metrics
            (patient_id, patient_phone, weight, abdomen, bp, sugar, recorded_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())";

    $stmt = mysqli_prepare($connection1, $sql);

    if (!$stmt) {
        sendJsonResponse(false, 'Unable to prepare health reading.', [], 500);
    }

    $dbPatientId = (int)$patient['id'];
    $patientPhone = (string)($patient['phone_number'] ?? '');

    mysqli_stmt_bind_param(
    $stmt,
    'isddsds',
    $dbPatientId,
    $patientPhone,
    $weight,
    $abdomen,
    $bp,
    $sugar,
    $date
);

    if (!mysqli_stmt_execute($stmt)) {
        mysqli_stmt_close($stmt);
        sendJsonResponse(false, 'Unable to save health reading.', [], 500);
    }

    mysqli_stmt_close($stmt);

    $metricsAndGraphs = getLatestMetricsAndGraphs(
        $connection1,
        $dbPatientId,
        $patientPhone
    );

    sendJsonResponse(true, 'Health reading saved successfully.', [
        'date' => $date,
        'metrics' => $metricsAndGraphs['latest'],
        'graphs' => $metricsAndGraphs['graphs']
    ]);
}

/* --------------------------------------------------------------------------
 * GET: dashboard / diet
 * -------------------------------------------------------------------------- */

if ($requestMethod !== 'GET') {
    sendJsonResponse(false, 'Invalid dashboard request.', [], 400);
}

$patientDbId = (int)$patient['id'];
$patientName = trim((string)($patient['full_name'] ?? ''));
$patientPhone = trim((string)($patient['phone_number'] ?? ''));
$currentPackageName = trim((string)($patient['package_name'] ?? ''));

$package = getPackageDetails($connection1, $currentPackageName);
$packageProgress = calculatePackageProgress($patient, $package);

/* Upcoming consultations are patient-specific. */
$upcomingCount = 0;
if (tableExists($connection1, 'appointments')) {
    $sql = "SELECT COUNT(*) AS count
            FROM appointments
            WHERE (patient_id = ? OR (? <> '' AND (patient_name = ? OR patient_name LIKE ?)))
              AND status IN ('Scheduled', 'Upcoming')";

    $stmt = mysqli_prepare($connection1, $sql);
    if ($stmt) {
        $nameLike = '%' . $patientName . '%';
        mysqli_stmt_bind_param($stmt, 'isss', $patientDbId, $patientName, $patientName, $nameLike);
        mysqli_stmt_execute($stmt);
        $result = mysqli_stmt_get_result($stmt);
        $row = mysqli_fetch_assoc($result);
        $upcomingCount = (int)($row['count'] ?? 0);
        mysqli_stmt_close($stmt);
    }
}

/* Active package count comes from this patient's package assignment. */
$activePackagesCount = 0;
if ($currentPackageName !== '') {
    $status = strtolower(trim((string)($patient['status'] ?? '')));
    if ($status === '' || in_array($status, ['active', 'ongoing', 'scheduled'], true)) {
        $activePackagesCount = 1;
    }
}

$unreadMessagesCount = getUnreadMessagesCount($connection1, $patient);

$metricsAndGraphs = getLatestMetricsAndGraphs(
    $connection1,
    $patientDbId,
    $patientPhone
);

$notifications = getNotifications($connection1, $patient);

$dietPlan = $packageProgress['diet_plan'] ?? null;

$patientResponse = [
    'id' => $patientDbId,
    'patient_id' => $patient['patient_id'] ?? '',
    'full_name' => $patientName,
    'phone_number' => $patientPhone,
    'email' => $patient['email'] ?? '',
    'package_name' => $currentPackageName,
    'status' => $patient['status'] ?? ''
];

if (in_array($action, ['view_diet', 'get_diet', 'diet'], true)) {
    sendJsonResponse(true, 'Diet plan loaded from database.', [
        'package_name' => $currentPackageName,
        'patient_name' => $patientName,
        'diet_plan' => $dietPlan
    ]);
}

sendJsonResponse(true, 'Dashboard data loaded successfully from database.', [
    'patient' => $patientResponse,
    'stats' => [
        'upcoming_consultations' => $upcomingCount,
        'active_packages' => $activePackagesCount,
        'unread_messages' => $unreadMessagesCount
    ],
    'my_package' => $packageProgress,
    'diet_plan' => $dietPlan,
    'metrics' => $metricsAndGraphs['latest'],
    'graphs' => $metricsAndGraphs['graphs'],
    'notifications' => $notifications
]);
