<?php
/**
 * Ocayur Patient Portal - Dashboard Health Metrics & Graphs API
 * Endpoint: /api/dashboard_metrics.php
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
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

function sendMetricsResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function metricsTableExists($connection, $table) {
    static $cache = [];
    if (!$connection || !preg_match('/^[A-Za-z0-9_]+$/', $table)) return false;
    if (isset($cache[$table])) return $cache[$table];
    $tableEscaped = mysqli_real_escape_string($connection, $table);
    $res = mysqli_query($connection, "SHOW TABLES LIKE '{$tableEscaped}'");
    $exists = ($res && mysqli_num_rows($res) > 0);
    $cache[$table] = $exists;
    return $exists;
}

function resolveMetricsPatient($connection, $phone, $email, $patientId) {
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

function formatMetricNumber($value) {
    if ($value === null || $value === '') return null;
    $number = (float)$value;
    return floor($number) == $number ? (string)(int)$number : rtrim(rtrim(number_format($number, 2, '.', ''), '0'), '.');
}

function getMetricDateLabelWeek($dateStr) {
    $time = strtotime($dateStr);
    if (!$time) return '';
    $start = strtotime('monday this week', $time);
    $end = strtotime('+6 days', $start);
    if (date('M', $start) === date('M', $end)) {
        return date('d', $start) . '-' . date('d M', $end);
    }
    return date('d M', $start) . '-' . date('d M', $end);
}

function fetchMetricsAndGraphsData($connection, $patientId, $phone) {
    $metrics = [
        'weight' => null, 'weight_raw' => null,
        'abdomen' => null, 'abdomen_raw' => null,
        'bp' => null,
        'sugar' => null, 'sugar_raw' => null
    ];

    $graphs = [
        'weight' => [
            'label' => 'Weight', 'unit' => 'kgs',
            'y_axis' => [100, 80, 60, 40, 20, 0], 'max_val' => 100,
            'color_class' => 'bar-teal', 'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ],
        'abdomen' => [
            'label' => 'Abdomen Girth', 'unit' => 'cm',
            'y_axis' => [100, 80, 60, 40, 20, 0], 'max_val' => 100,
            'color_class' => 'bar-plum', 'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ],
        'bp' => [
            'label' => 'Blood Pressure', 'unit' => 'mm Hg',
            'y_axis' => [150, 120, 90, 60, 30, 0], 'max_val' => 150,
            'color_class' => 'bar-amber', 'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ],
        'sugar' => [
            'label' => 'Blood Sugar', 'unit' => 'mg/dL',
            'y_axis' => [125, 100, 75, 50, 25, 0], 'max_val' => 125,
            'color_class' => 'bar-blue', 'latest' => null,
            'timeframes' => ['6w' => [], '3m' => [], '6m' => []]
        ]
    ];

    if (!$connection || (!$patientId && !$phone) || !metricsTableExists($connection, 'health_metrics')) {
        return ['latest' => $metrics, 'graphs' => $graphs, 'has_recorded_today' => false, 'recorded_dates' => [], 'today_date' => date('Y-m-d')];
    }

    $sql = "SELECT id, weight, abdomen, bp, sugar, recorded_date, created_at
            FROM health_metrics
            WHERE ((patient_id = ? AND ? > 0) OR (patient_phone = ? AND ? <> ''))
              AND recorded_date IS NOT NULL
              AND recorded_date >= '1970-01-01'
            ORDER BY recorded_date ASC, id ASC";

    $stmt = mysqli_prepare($connection, $sql);
    if (!$stmt) {
        return ['latest' => $metrics, 'graphs' => $graphs, 'has_recorded_today' => false, 'recorded_dates' => [], 'today_date' => date('Y-m-d')];
    }

    mysqli_stmt_bind_param($stmt, 'iiss', $patientId, $patientId, $phone, $phone);
    mysqli_stmt_execute($stmt);
    $result = mysqli_stmt_get_result($stmt);

    $readings = [];
    while ($row = mysqli_fetch_assoc($result)) {
        $readings[] = $row;
    }
    mysqli_stmt_close($stmt);

    // Latest non-null reading
    for ($i = count($readings) - 1; $i >= 0; $i--) {
        $row = $readings[$i];
        if ($metrics['weight'] === null && $row['weight'] !== null && $row['weight'] !== '') {
            $v = (float)$row['weight'];
            $metrics['weight_raw'] = $v;
            $metrics['weight'] = formatMetricNumber($v) . ' kgs';
        }
        if ($metrics['abdomen'] === null && $row['abdomen'] !== null && $row['abdomen'] !== '') {
            $v = (float)$row['abdomen'];
            $metrics['abdomen_raw'] = $v;
            $metrics['abdomen'] = formatMetricNumber($v) . ' cm';
        }
        if ($metrics['bp'] === null && $row['bp'] !== null && trim($row['bp']) !== '') {
            $metrics['bp'] = trim($row['bp']) . (stripos($row['bp'], 'mm') === false ? ' mm Hg' : '');
        }
        if ($metrics['sugar'] === null && $row['sugar'] !== null && $row['sugar'] !== '') {
            $v = (float)$row['sugar'];
            $metrics['sugar_raw'] = $v;
            $metrics['sugar'] = formatMetricNumber($v) . ' mg/dL';
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
        if (!$timestamp) continue;

        $dateLabel = getMetricDateLabelWeek($row['recorded_date']);

        foreach (['weight', 'abdomen', 'sugar'] as $metric) {
            if ($row[$metric] === null || $row[$metric] === '') continue;
            $value = (float)$row[$metric];
            $max = ($metric === 'sugar') ? 125 : 100;

            $item = [
                'date_label' => $dateLabel,
                'val_label' => formatMetricNumber($value),
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
            if (preg_match('/^(\d{2,3})/', $bp, $match)) {
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

    $recordedDates = [];
    $hasRecordedToday = false;
    $todayDate = date('Y-m-d');

    foreach ($readings as $row) {
        if (!empty($row['recorded_date'])) {
            $recD = (string)$row['recorded_date'];
            $recordedDates[] = $recD;
            if ($recD === $todayDate) {
                $hasRecordedToday = true;
            }
        }
        if (!empty($row['created_at']) && date('Y-m-d', strtotime($row['created_at'])) === $todayDate) {
            $hasRecordedToday = true;
        }
    }

    return [
        'latest' => $metrics,
        'graphs' => $graphs,
        'has_recorded_today' => $hasRecordedToday,
        'recorded_dates' => array_values(array_unique($recordedDates)),
        'today_date' => $todayDate
    ];
}

try {
    $data = [];
    if ($requestMethod === 'POST') {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        if (!is_array($data)) $data = $_POST;
    }

    $sessionPhone = trim((string)($_SESSION['phone_number'] ?? $_SESSION['phone'] ?? ''));
    $sessionPatientId = trim((string)($_SESSION['patient_id'] ?? ''));
    $sessionEmail = trim((string)($_SESSION['email'] ?? ''));

    if ($requestMethod === 'GET') {
        $phone = trim((string)($_GET['phone'] ?? $sessionPhone));
        $email = trim((string)($_GET['email'] ?? $sessionEmail));
        $patientId = trim((string)($_GET['patient_id'] ?? $sessionPatientId));
    } else {
        $phone = trim((string)($data['phone'] ?? $sessionPhone));
        $email = trim((string)($data['email'] ?? $sessionEmail));
        $patientId = trim((string)($data['patient_id'] ?? $sessionPatientId));
    }

    $patient = resolveMetricsPatient($connection1, $phone, $email, $patientId);

    if (!$patient) {
        sendMetricsResponse(false, 'Patient record not found.', [
            'metrics' => [
                'weight' => null, 'weight_raw' => null,
                'abdomen' => null, 'abdomen_raw' => null,
                'bp' => null,
                'sugar' => null, 'sugar_raw' => null
            ],
            'graphs' => [],
            'has_recorded_today' => false,
            'recorded_dates' => []
        ], 200);
    }

    $dbPatientId = (int)$patient['id'];
    $patientPhone = (string)($patient['phone_number'] ?? '');

    // POST: Add Health Metric Reading
    if ($requestMethod === 'POST') {
        if (!metricsTableExists($connection1, 'health_metrics')) {
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
            mysqli_query($connection1, $createTable);
        }

        $rawDate = trim((string)($data['date'] ?? ''));
        $date = ($rawDate !== '' && strtotime($rawDate) !== false) ? date('Y-m-d', strtotime($rawDate)) : date('Y-m-d');

        $cleanNumber = static function ($value) {
            if ($value === null || $value === '') return null;
            $value = preg_replace('/[^\d.]/', '', (string)$value);
            return is_numeric($value) && (float)$value > 0 ? (float)$value : null;
        };

        $weight = $cleanNumber($data['weight'] ?? null);
        $abdomen = $cleanNumber($data['abdomen'] ?? null);
        $sugar = $cleanNumber($data['sugar'] ?? null);

        $rawBp = trim((string)($data['bp'] ?? ''));
        $bp = null;
        if ($rawBp !== '') {
            $cleanBp = preg_replace('/[^\d\/]/', '', $rawBp);
            if (preg_match('/^(\d{2,3})\s*\/\s*(\d{2,3})$/', $cleanBp, $match)) {
                $bp = $match[1] . '/' . $match[2];
            } elseif (preg_match('/^\d{2,3}$/', $cleanBp)) {
                $bp = $cleanBp;
            } else {
                sendMetricsResponse(false, 'Invalid Blood Pressure format. Use format like 120/80.', [], 400);
            }
        }

        if ($weight === null && $abdomen === null && $bp === null && $sugar === null) {
            sendMetricsResponse(false, 'Please enter at least one health metric parameter.', [], 400);
        }

        // Check if already added today
        $todayDate = date('Y-m-d');
        $checkSql = "SELECT id, recorded_date, created_at FROM health_metrics 
                     WHERE ((patient_id = ? AND ? > 0) OR (patient_phone = ? AND ? <> ''))
                       AND (recorded_date = ? OR DATE(created_at) = CURDATE() OR recorded_date = CURDATE())
                     LIMIT 1";
        $checkStmt = mysqli_prepare($connection1, $checkSql);
        if ($checkStmt) {
            mysqli_stmt_bind_param($checkStmt, 'iisss', $dbPatientId, $dbPatientId, $patientPhone, $patientPhone, $date);
            mysqli_stmt_execute($checkStmt);
            $checkRes = mysqli_stmt_get_result($checkStmt);
            if ($checkRes && ($existingRow = mysqli_fetch_assoc($checkRes))) {
                mysqli_stmt_close($checkStmt);
                sendMetricsResponse(false, 'You have already recorded your health metrics for today.', [
                    'already_recorded' => true,
                    'recorded_date' => $existingRow['recorded_date'] ?? $date
                ], 400);
            }
            mysqli_stmt_close($checkStmt);
        }

        $sql = "INSERT INTO health_metrics (patient_id, patient_phone, weight, abdomen, bp, sugar, recorded_date, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())";
        $stmt = mysqli_prepare($connection1, $sql);
        if (!$stmt) sendMetricsResponse(false, 'Unable to prepare health reading.', [], 500);

        mysqli_stmt_bind_param($stmt, 'isddsds', $dbPatientId, $patientPhone, $weight, $abdomen, $bp, $sugar, $date);
        if (!mysqli_stmt_execute($stmt)) {
            mysqli_stmt_close($stmt);
            sendMetricsResponse(false, 'Unable to save health reading.', [], 500);
        }
        mysqli_stmt_close($stmt);

        $resultData = fetchMetricsAndGraphsData($connection1, $dbPatientId, $patientPhone);
        sendMetricsResponse(true, 'Health reading saved successfully.', [
            'date' => $date,
            'metrics' => $resultData['latest'],
            'graphs' => $resultData['graphs'],
            'has_recorded_today' => true,
            'recorded_dates' => $resultData['recorded_dates'] ?? [$date]
        ]);
    }

    // GET Request: Load metrics and graphs
    $resultData = fetchMetricsAndGraphsData($connection1, $dbPatientId, $patientPhone);

    sendMetricsResponse(true, 'Health metrics loaded successfully.', [
        'metrics' => $resultData['latest'],
        'graphs' => $resultData['graphs'],
        'has_recorded_today' => $resultData['has_recorded_today'],
        'recorded_dates' => $resultData['recorded_dates'],
        'today_date' => $resultData['today_date']
    ]);

} catch (Throwable $e) {
    sendMetricsResponse(false, 'Error loading health metrics: ' . $e->getMessage(), [
        'metrics' => [
            'weight' => null, 'weight_raw' => null,
            'abdomen' => null, 'abdomen_raw' => null,
            'bp' => null,
            'sugar' => null, 'sugar_raw' => null
        ],
        'graphs' => [],
        'has_recorded_today' => false,
        'recorded_dates' => []
    ], 200);
}
