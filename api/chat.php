<?php
/**
 * Ocayur Patient Portal - One-Way / Simple Text Chat API with Read Receipts
 * Endpoint: /api/chat.php
 */

if (session_status() === PHP_SESSION_NONE) {
    @session_start();
}

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($requestMethod === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/database.php';

date_default_timezone_set('Asia/Kolkata');
if (isset($connection1) && $connection1) {
    mysqli_query($connection1, "SET time_zone = '+05:30'");
}

function sendJson($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data));
    exit();
}

// Check if chat_messages table exists
$chkTable = mysqli_query($connection1, "SHOW TABLES LIKE 'chat_messages'");
$hasTable = ($chkTable && mysqli_num_rows($chkTable) > 0);

if (!$hasTable) {
    sendJson(false, 'Database table `chat_messages` does not exist yet. Please execute chat_schema.sql on your database.', [
        'table_missing' => true,
        'sql_required' => "CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `doctor_id` INT(11) NOT NULL,
  `patient_id` INT(11) NOT NULL,
  `sender_type` ENUM('doctor', 'patient') NOT NULL,
  `message` TEXT NOT NULL,
  `is_seen` TINYINT(1) NOT NULL DEFAULT 0,
  `seen_at` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_chat_pair` (`doctor_id`, `patient_id`, `created_at`),
  KEY `idx_unread` (`doctor_id`, `patient_id`, `sender_type`, `is_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;"
    ], 200);
}

// 1. Resolve Patient ID
$patientId = 0;
$phone = $_SESSION['phone_number'] ?? '';
$sessPatientCode = $_SESSION['patient_id'] ?? '';

if (!empty($_GET['patient_id'])) {
    $patientId = (int)$_GET['patient_id'];
} elseif (!empty($_POST['patient_id'])) {
    $patientId = (int)$_POST['patient_id'];
} elseif (!empty($phone)) {
    $pStmt = mysqli_prepare($connection1, "SELECT id FROM patients WHERE phone_number = ? LIMIT 1");
    if ($pStmt) {
        mysqli_stmt_bind_param($pStmt, "s", $phone);
        mysqli_stmt_execute($pStmt);
        $res = mysqli_stmt_get_result($pStmt);
        if ($pRow = mysqli_fetch_assoc($res)) {
            $patientId = (int)$pRow['id'];
        }
        mysqli_stmt_close($pStmt);
    }
} elseif (!empty($sessPatientCode)) {
    $pStmt = mysqli_prepare($connection1, "SELECT id FROM patients WHERE patient_id = ? LIMIT 1");
    if ($pStmt) {
        mysqli_stmt_bind_param($pStmt, "s", $sessPatientCode);
        mysqli_stmt_execute($pStmt);
        $res = mysqli_stmt_get_result($pStmt);
        if ($pRow = mysqli_fetch_assoc($res)) {
            $patientId = (int)$pRow['id'];
        }
        mysqli_stmt_close($pStmt);
    }
}

// Fallback to first patient in database (e.g. Rahul Sharma, ID 1)
if ($patientId <= 0) {
    $qPatFirst = mysqli_query($connection1, "SELECT id FROM patients ORDER BY id ASC LIMIT 1");
    if ($qPatFirst && $fRow = mysqli_fetch_assoc($qPatFirst)) {
        $patientId = (int)$fRow['id'];
    } else {
        $patientId = 1;
    }
}

// Fetch active Patient Details
$patStmt = mysqli_prepare($connection1, "SELECT id, patient_id, full_name, phone_number, package_name, status, gender, age FROM patients WHERE id = ? LIMIT 1");
mysqli_stmt_bind_param($patStmt, "i", $patientId);
mysqli_stmt_execute($patStmt);
$patRes = mysqli_stmt_get_result($patStmt);
$patientInfo = mysqli_fetch_assoc($patRes);
mysqli_stmt_close($patStmt);

if (!$patientInfo) {
    $patientInfo = [
        'id' => $patientId,
        'patient_id' => 'P001',
        'full_name' => 'Rahul Sharma',
        'phone_number' => '9876543210',
        'package_name' => 'Stresscare',
        'status' => 'Ongoing'
    ];
}

$nameParts = preg_split('/\s+/', trim($patientInfo['full_name']));
$initials = '';
foreach ($nameParts as $np) {
    if (!empty($np)) $initials .= strtoupper($np[0]);
}
$patientInfo['initials'] = substr($initials, 0, 2) ?: 'PT';

// Helper: Format chat message
function formatChatMessage($row) {
    $createdTs = strtotime($row['created_at']);
    $dateLabel = date('Y-m-d', $createdTs);
    $today = date('Y-m-d');
    $yesterday = date('Y-m-d', strtotime('-1 day'));
    
    if ($dateLabel === $today) {
        $displayDate = 'Today';
    } elseif ($dateLabel === $yesterday) {
        $displayDate = 'Yesterday';
    } else {
        $displayDate = date('d M Y', $createdTs);
    }
    
    $seenAtDisplay = null;
    if (!empty($row['seen_at'])) {
        $seenTs = strtotime($row['seen_at']);
        $seenAtDisplay = date('g:i A', $seenTs);
    }

    return [
        'id' => (int)$row['id'],
        'doctor_id' => (int)$row['doctor_id'],
        'patient_id' => (int)$row['patient_id'],
        'sender_type' => $row['sender_type'], // 'doctor' or 'patient'
        'message' => $row['message'],
        'is_seen' => (int)$row['is_seen'],
        'seen_at' => $row['seen_at'],
        'seen_at_display' => $seenAtDisplay,
        'time' => date('g:i A', $createdTs),
        'date' => $displayDate,
        'raw_date' => $dateLabel,
        'created_at' => $row['created_at']
    ];
}

// ============================================================================
// 2. POST: Send Text Message (Patient -> Doctor)
// ============================================================================
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    $inputData = json_decode($rawInput, true);
    if (!is_array($inputData)) {
        $inputData = $_POST;
    }

    $doctorId = (int)($inputData['doctor_id'] ?? 0);
    $messageText = trim((string)($inputData['message'] ?? ''));

    if ($doctorId <= 0) {
        sendJson(false, 'Please select a valid doctor to chat with.', [], 400);
    }
    if ($messageText === '') {
        sendJson(false, 'Message cannot be empty.', [], 400);
    }

    // Verify doctor exists
    $dStmt = mysqli_prepare($connection1, "SELECT id, doctorid, full_name, expertise FROM doctors WHERE id = ? LIMIT 1");
    mysqli_stmt_bind_param($dStmt, "i", $doctorId);
    mysqli_stmt_execute($dStmt);
    $dRes = mysqli_stmt_get_result($dStmt);
    $doctorData = mysqli_fetch_assoc($dRes);
    mysqli_stmt_close($dStmt);

    if (!$doctorData) {
        sendJson(false, 'Doctor not found.', [], 404);
    }

    // Insert new message as 'patient', initially is_seen = 0
    $insertQuery = "INSERT INTO `chat_messages` (`doctor_id`, `patient_id`, `sender_type`, `message`, `is_seen`, `created_at`) VALUES (?, ?, 'patient', ?, 0, NOW())";
    $insStmt = mysqli_prepare($connection1, $insertQuery);
    if (!$insStmt) {
        sendJson(false, 'Failed to prepare message insertion: ' . mysqli_error($connection1), [], 500);
    }

    mysqli_stmt_bind_param($insStmt, "iis", $doctorId, $patientId, $messageText);
    $executed = mysqli_stmt_execute($insStmt);
    $newMsgId = mysqli_insert_id($connection1);
    mysqli_stmt_close($insStmt);

    if ($executed && $newMsgId > 0) {
        $qFetch = mysqli_query($connection1, "SELECT * FROM `chat_messages` WHERE `id` = {$newMsgId} LIMIT 1");
        $newRow = mysqli_fetch_assoc($qFetch);

        sendJson(true, 'Message sent successfully. Read receipt will update when doctor refreshes.', [
            'message_item' => formatChatMessage($newRow),
            'doctor' => $doctorData
        ]);
    } else {
        sendJson(false, 'Failed to send message.', [], 500);
    }
}

// ============================================================================
// 3. GET: Retrieve Chat Thread with Doctor OR Doctor List
// ============================================================================
$doctorIdParam = isset($_GET['doctor_id']) ? (int)$_GET['doctor_id'] : 0;

// If no doctor_id provided, find the primary doctor for this patient (e.g. from appointments or first doctor)
if ($doctorIdParam <= 0) {
    // Check if patient has any appointment with a doctor
    $apptDocQ = mysqli_query($connection1, "SELECT doctor_id FROM appointments WHERE patient_id = {$patientId} ORDER BY id DESC LIMIT 1");
    if ($apptDocQ && $aRow = mysqli_fetch_assoc($apptDocQ)) {
        $doctorIdParam = (int)$aRow['doctor_id'];
    }
    // Fallback to active doctor
    if ($doctorIdParam <= 0) {
        $qD1 = mysqli_query($connection1, "SELECT id FROM doctors WHERE status = 'Active' ORDER BY id ASC LIMIT 1");
        if ($qD1 && $d1 = mysqli_fetch_assoc($qD1)) {
            $doctorIdParam = (int)$d1['id'];
        } else {
            $doctorIdParam = 1;
        }
    }
}

// 3.1 Fetch Doctor Details
$docStmt = mysqli_prepare($connection1, "SELECT id, doctorid, full_name, expertise, area, years_of_experience, email, phone_number, status FROM doctors WHERE id = ? LIMIT 1");
mysqli_stmt_bind_param($docStmt, "i", $doctorIdParam);
mysqli_stmt_execute($docStmt);
$docRes = mysqli_stmt_get_result($docStmt);
$doctorInfo = mysqli_fetch_assoc($docRes);
mysqli_stmt_close($docStmt);

if (!$doctorInfo) {
    $doctorInfo = [
        'id' => $doctorIdParam,
        'doctorid' => 'DOC000001',
        'full_name' => 'Dr. Nidhi Jha',
        'expertise' => 'Ayurveda Physician',
        'area' => 'Pediatrics & Gynecology',
        'status' => 'Active'
    ];
}

$cleanDocName = preg_replace('/^(Dr\.|Dr)\s*/i', '', $doctorInfo['full_name']);
$dWords = preg_split('/\s+/', trim($cleanDocName));
$dInitials = '';
foreach ($dWords as $w) {
    if (!empty($w)) $dInitials .= strtoupper($w[0]);
}
$doctorInfo['initials'] = substr($dInitials, 0, 2) ?: 'DR';

// 3.2 READ RECEIPT UPDATE:
// Mark all unseen messages sent by the DOCTOR to this PATIENT as seen by this PATIENT
$updateSeen = "UPDATE `chat_messages` 
               SET `is_seen` = 1, `seen_at` = NOW() 
               WHERE `doctor_id` = ? AND `patient_id` = ? AND `sender_type` = 'doctor' AND `is_seen` = 0";
if ($uStmt = mysqli_prepare($connection1, $updateSeen)) {
    mysqli_stmt_bind_param($uStmt, "ii", $doctorIdParam, $patientId);
    mysqli_stmt_execute($uStmt);
    mysqli_stmt_close($uStmt);
}

// 3.3 Fetch Chat Messages
$chatQuery = "SELECT id, doctor_id, patient_id, sender_type, message, is_seen, seen_at, created_at 
              FROM `chat_messages` 
              WHERE `doctor_id` = ? AND `patient_id` = ? 
              ORDER BY `created_at` ASC, `id` ASC";

$messages = [];
if ($stmtChat = mysqli_prepare($connection1, $chatQuery)) {
    mysqli_stmt_bind_param($stmtChat, "ii", $doctorIdParam, $patientId);
    mysqli_stmt_execute($stmtChat);
    $resChat = mysqli_stmt_get_result($stmtChat);
    while ($cRow = mysqli_fetch_assoc($resChat)) {
        $messages[] = formatChatMessage($cRow);
    }
    mysqli_stmt_close($stmtChat);
}

// 3.4 Build list of available doctors for side panel selector
$doctorsList = [];
$allDocQ = mysqli_query($connection1, "SELECT id, doctorid, full_name, expertise, area, years_of_experience, status FROM doctors WHERE status = 'Active' ORDER BY id ASC");
if ($allDocQ) {
    while ($dr = mysqli_fetch_assoc($allDocQ)) {
        $dId = (int)$dr['id'];
        
        $cName = preg_replace('/^(Dr\.|Dr)\s*/i', '', $dr['full_name']);
        $words = preg_split('/\s+/', trim($cName));
        $inits = '';
        foreach ($words as $w) {
            if (!empty($w)) $inits .= strtoupper($w[0]);
        }
        $dr['initials'] = substr($inits, 0, 2) ?: 'DR';

        // Last message & unseen count
        $lmQ = mysqli_query($connection1, "SELECT message, sender_type, is_seen, created_at FROM `chat_messages` WHERE `doctor_id` = {$dId} AND `patient_id` = {$patientId} ORDER BY `created_at` DESC, `id` DESC LIMIT 1");
        $lastM = ($lmQ && mysqli_num_rows($lmQ) > 0) ? mysqli_fetch_assoc($lmQ) : null;

        $unseenQ = mysqli_query($connection1, "SELECT COUNT(*) as unread_count FROM `chat_messages` WHERE `doctor_id` = {$dId} AND `patient_id` = {$patientId} AND `sender_type` = 'doctor' AND `is_seen` = 0");
        $unreadC = ($unseenQ && $uR = mysqli_fetch_assoc($unseenQ)) ? (int)$uR['unread_count'] : 0;

        $dr['last_message'] = $lastM ? $lastM['message'] : 'No messages yet';
        $dr['last_message_sender'] = $lastM ? $lastM['sender_type'] : '';
        $dr['last_message_time'] = $lastM ? date('g:i A', strtotime($lastM['created_at'])) : '';
        $dr['unread_count'] = $unreadC;

        $doctorsList[] = $dr;
    }
}

sendJson(true, 'Chat thread loaded successfully', [
    'patient' => $patientInfo,
    'doctor' => $doctorInfo,
    'messages' => $messages,
    'messages_count' => count($messages),
    'doctors' => $doctorsList
]);
