<?php
/**
 * Ocayur Patient Portal - Dashboard Diet Plan API
 * Endpoint: /api/dashboard_diet.php
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

function sendDietResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => (bool)$success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

function dietTableExists($connection, $table) {
    static $cache = [];
    if (!$connection || !preg_match('/^[A-Za-z0-9_]+$/', $table)) return false;
    if (isset($cache[$table])) return $cache[$table];
    $tableEscaped = mysqli_real_escape_string($connection, $table);
    $res = mysqli_query($connection, "SHOW TABLES LIKE '{$tableEscaped}'");
    $exists = ($res && mysqli_num_rows($res) > 0);
    $cache[$table] = $exists;
    return $exists;
}

function resolveDietPatient($connection, $phone, $email, $patientId) {
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

    $sql = "SELECT id, patient_id, full_name, phone_number, email, package_name
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

function fetchRemoteDietPdfContent($url) {
    if (empty($url)) return null;

    if (function_exists('curl_init')) {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Ocayur-Patient-Portal/1.0');
        $data = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($data !== false && $httpCode === 200 && substr($data, 0, 4) === '%PDF') {
            return $data;
        }
    }

    $ctx = stream_context_create([
        'http' => ['timeout' => 6, 'follow_location' => 1, 'user_agent' => 'Ocayur-Patient-Portal/1.0'],
        'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]
    ]);

    $data = @file_get_contents($url, false, $ctx);
    if ($data !== false && substr($data, 0, 4) === '%PDF') {
        return $data;
    }

    return null;
}

function findLocalDietPdfFile($pdfRelPath, $pdfName, $patientDbId) {
    $baseName = basename((string)$pdfRelPath);
    if (empty($baseName) || $baseName === '.' || $baseName === '/') {
        $baseName = basename((string)$pdfName);
    }

    $dirs = [
        __DIR__ . '/../uploads/diets',
        __DIR__ . '/../dashboard/uploads/diets',
        __DIR__ . '/../../panchved/uploads/diets',
        __DIR__ . '/../../panchved/dashboard/uploads/diets',
        __DIR__ . '/../../uploads/diets',
        dirname(__DIR__, 2) . '/panchved/uploads/diets',
        dirname(__DIR__, 2) . '/panchved/dashboard/uploads/diets'
    ];

    if (!empty($_SERVER['DOCUMENT_ROOT'])) {
        $doc = rtrim($_SERVER['DOCUMENT_ROOT'], '/\\');
        $dirs[] = $doc . '/uploads/diets';
        $dirs[] = $doc . '/dashboard/uploads/diets';
        $dirs[] = $doc . '/panchved/uploads/diets';
    }

    if (!empty($baseName)) {
        foreach ($dirs as $dir) {
            $candidate = $dir . '/' . $baseName;
            if (@file_exists($candidate) && @is_file($candidate)) {
                return $candidate;
            }
        }
    }

    if ($patientDbId > 0) {
        foreach ($dirs as $dir) {
            if (@is_dir($dir)) {
                $matched = @glob($dir . '/diet_' . $patientDbId . '_*.pdf');
                if (!empty($matched)) {
                    usort($matched, fn($a, $b) => filemtime($b) - filemtime($a));
                    return $matched[0];
                }
            }
        }
    }

    return null;
}

try {
    $action = trim((string)($_GET['action'] ?? ''));
    $sessionPhone = trim((string)($_SESSION['phone_number'] ?? $_SESSION['phone'] ?? ''));
    $sessionPatientId = trim((string)($_SESSION['patient_id'] ?? ''));
    $sessionEmail = trim((string)($_SESSION['email'] ?? ''));

    $phone = trim((string)($_GET['phone'] ?? $sessionPhone));
    $email = trim((string)($_GET['email'] ?? $sessionEmail));
    $patientId = trim((string)($_GET['patient_id'] ?? $sessionPatientId));

    $patient = resolveDietPatient($connection1, $phone, $email, $patientId);

    if (!$patient) {
        sendDietResponse(false, 'Patient record not found.', ['diet_plan' => null], 200);
    }

    $patientDbId = (int)$patient['id'];
    $patientCode = (string)($patient['patient_id'] ?? '');

    $docDiet = null;
    if ($patientDbId > 0 && dietTableExists($connection1, 'patient_diets')) {
        $stmt = mysqli_prepare($connection1, "SELECT * FROM `patient_diets` WHERE `patient_id` = ? ORDER BY `id` DESC LIMIT 1");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, "i", $patientDbId);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            if ($row = mysqli_fetch_assoc($res)) {
                $docDiet = $row;
            }
            mysqli_stmt_close($stmt);
        }
    }

    // Check JSON fallback
    $jsonRecord = null;
    $jsonPath = __DIR__ . '/../uploads/diets/diets_data.json';
    if (!$docDiet && file_exists($jsonPath)) {
        $jsonData = json_decode(@file_get_contents($jsonPath), true);
        if (is_array($jsonData)) {
            $jsonRecord = $jsonData[(string)$patientDbId] ?? ($patientCode !== '' ? ($jsonData[$patientCode] ?? null) : null);
        }
    }

    $notes = '';
    $pdfRelPath = '';
    $fileName = '';
    $fileSize = 0;
    $updatedAt = '';
    $doctorName = 'Dr. Nidhi Jha';

    if ($docDiet) {
        $notes = trim((string)($docDiet['notes'] ?? ''));
        $pdfRelPath = trim((string)($docDiet['pdf_path'] ?? ''));
        $fileName = trim((string)($docDiet['file_name'] ?? ''));
        $fileSize = (int)($docDiet['file_size'] ?? 0);
        $updatedAt = (string)($docDiet['updated_at'] ?? $docDiet['created_at'] ?? '');
        $doctorName = trim((string)($docDiet['doctor_name'] ?? 'Dr. Nidhi Jha'));
    } elseif ($jsonRecord) {
        $notes = trim((string)($jsonRecord['notes'] ?? ''));
        $pdfRelPath = trim((string)($jsonRecord['pdf_url'] ?? $jsonRecord['pdf_filename'] ?? ''));
        $fileName = trim((string)($jsonRecord['original_filename'] ?? basename($pdfRelPath)));
        $fileSize = (int)($jsonRecord['file_size'] ?? 0);
        $updatedAt = (string)($jsonRecord['updated_at'] ?? '');
        $doctorName = trim((string)($jsonRecord['doctor_name'] ?? 'Dr. Nidhi Jha'));
    }

    $hasPdf = !empty($pdfRelPath) || !empty($fileName);
    $basePdfName = basename($pdfRelPath) ?: basename($fileName);
    $directPdfUrl = ($hasPdf && !empty($basePdfName)) ? ('https://doctor.ocayur.com/dashboard/uploads/diets/' . rawurlencode($basePdfName)) : null;

    // Streaming or Download of Diet PDF
    if (in_array($action, ['view_diet_pdf', 'download_diet_pdf'], true)) {
        $pdfName = !empty($fileName) ? $fileName : ('diet_chart_' . $patientDbId . '.pdf');
        $targetFile = findLocalDietPdfFile($pdfRelPath, $pdfName, $patientDbId);

        if (!$targetFile && !empty($basePdfName)) {
            $remoteUrl = 'https://doctor.ocayur.com/dashboard/uploads/diets/' . rawurlencode($basePdfName);
            $content = fetchRemoteDietPdfContent($remoteUrl);
            if ($content !== null) {
                $localDir = __DIR__ . '/../uploads/diets';
                if (!is_dir($localDir)) @mkdir($localDir, 0777, true);
                @file_put_contents($localDir . '/' . $basePdfName, $content);

                header('Content-Type: application/pdf');
                $disposition = ($action === 'download_diet_pdf') ? 'attachment' : 'inline';
                header('Content-Disposition: ' . $disposition . '; filename="' . rawurlencode($pdfName) . '"');
                header('Content-Length: ' . strlen($content));
                echo $content;
                exit();
            }

            // Direct redirect fallback to verified endpoint
            header('Location: ' . $remoteUrl);
            exit();
        }

        if ($targetFile && file_exists($targetFile)) {
            header('Content-Type: application/pdf');
            $disposition = ($action === 'download_diet_pdf') ? 'attachment' : 'inline';
            header('Content-Disposition: ' . $disposition . '; filename="' . rawurlencode($pdfName) . '"');
            header('Content-Length: ' . filesize($targetFile));
            readfile($targetFile);
            exit();
        }

        sendDietResponse(false, 'Diet plan PDF file not found.', [], 404);
    }

    $formattedSize = '';
    if ($fileSize > 0) {
        $formattedSize = $fileSize >= 1048576 ? round($fileSize / 1048576, 1) . ' MB' : round($fileSize / 1024, 1) . ' KB';
    }

    $p1 = $notes !== '' ? $notes : 'Follow personalized dietary recommendations as advised by your consulting doctor.';
    $p2 = '';

    $dietPlanData = [
        'patient_id' => $patientDbId,
        'doctor_name' => $doctorName,
        'notes' => $notes,
        'paragraph_1' => $p1,
        'paragraph_2' => $p2,
        'paragraphs' => array_values(array_filter([$p1, $p2])),
        'has_pdf' => $hasPdf,
        'pdf_path' => $pdfRelPath,
        'pdf_name' => $fileName ?: ($hasPdf ? 'Diet_Chart.pdf' : ''),
        'pdf_url' => $hasPdf ? ('../api/dashboard_diet.php?action=view_diet_pdf&phone=' . rawurlencode($phone) . '&patient_id=' . $patientDbId) : null,
        'download_url' => $hasPdf ? ('../api/dashboard_diet.php?action=download_diet_pdf&phone=' . rawurlencode($phone) . '&patient_id=' . $patientDbId) : null,
        'direct_url' => $directPdfUrl,
        'file_size' => $formattedSize,
        'updated_at' => $updatedAt ? date('d M Y', strtotime($updatedAt)) : date('d M Y')
    ];

    sendDietResponse(true, 'Diet plan loaded successfully.', [
        'package_name' => $patient['package_name'] ?? '',
        'patient_name' => $patient['full_name'] ?? '',
        'diet_plan' => $dietPlanData
    ]);

} catch (Throwable $e) {
    sendDietResponse(false, 'Error loading diet plan: ' . $e->getMessage(), ['diet_plan' => null], 200);
}
