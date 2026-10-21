<?php
/**
 * Ocayur Patient Portal - Workshops Backend API
 * Handles:
 * 1. GET (action: list / default) - Fetch workshops visible to patients (attendee_type = 'Patient' or 'Both' / 'All')
 * 2. GET (action: details) - Fetch single workshop details by id or workshop_id
 * 3. GET (action: my_workshops) - Fetch enrolled workshops for current patient
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE && !headers_sent()) {
    @session_start();
}

require_once __DIR__ . '/database.php';

// Helper function to return standardized JSON response
function sendJsonResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data));
    exit;
}

// Ensure `workshops` table exists
if ($connection1) {
    $createWorkshopsTable = "CREATE TABLE IF NOT EXISTS `workshops` (
      `id` INT(11) NOT NULL AUTO_INCREMENT,
      `workshop_id` VARCHAR(50) DEFAULT NULL,
      `title` VARCHAR(150) NOT NULL,
      `subtitle` VARCHAR(255) DEFAULT 'Holistic Health & Ayurveda Insights',
      `assign_speaker` VARCHAR(150) DEFAULT 'Dr. Nidhi Jha',
      `meet_link` VARCHAR(255) DEFAULT 'https://meet.google.com/xyz-abcd-efg',
      `instructor` VARCHAR(150) NOT NULL,
      `speaker` VARCHAR(150) DEFAULT NULL,
      `speaker_role` VARCHAR(150) DEFAULT 'Ayurveda Physician',
      `speaker_bio` TEXT DEFAULT NULL,
      `attendee_type` VARCHAR(100) NOT NULL DEFAULT 'Doctor',
      `date` DATE NOT NULL,
      `time` VARCHAR(50) NOT NULL DEFAULT '8:00 AM',
      `duration_text` VARCHAR(100) DEFAULT '90 mins',
      `location` VARCHAR(150) NOT NULL DEFAULT 'Ocayur Center / Hybrid Online',
      `capacity` INT(11) NOT NULL DEFAULT 50,
      `enrolled` INT(11) NOT NULL DEFAULT 0,
      `registrations` INT(11) NOT NULL DEFAULT 0,
      `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      `fee` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      `about` TEXT DEFAULT NULL,
      `image_url` VARCHAR(255) DEFAULT 'assets/courses/course_ayurveda_herbs.jpg',
      `status` ENUM('Upcoming', 'Completed', 'Cancelled', 'Active', 'Past') NOT NULL DEFAULT 'Upcoming',
      `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `idx_workshop_code` (`workshop_id`),
      KEY `idx_ws_date` (`date`),
      KEY `idx_ws_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;";
    @mysqli_query($connection1, $createWorkshopsTable);
}

// Doctor Initials Helper
function getInitialsFromName($name) {
    $clean = preg_replace('/^(Dr\.|Dr)\s*/i', '', trim((string)$name));
    $words = preg_split('/\s+/', $clean);
    $initials = '';
    foreach ($words as $w) {
        if (!empty($w)) $initials .= strtoupper($w[0]);
    }
    return substr($initials, 0, 2) ?: 'DR';
}

// Format Workshop Record
function formatWorkshopRecord($row) {
    $feeVal = isset($row['fee']) && (float)$row['fee'] > 0 ? (float)$row['fee'] : (isset($row['price']) ? (float)$row['price'] : 499.0);
    $feeFormatted = $feeVal > 0 ? '₹' . number_format($feeVal, 0) . '/-' : 'Free';

    // Format Date
    $dateRaw = trim((string)($row['date'] ?? ''));
    $formattedDate = '3 September, Wednesday';
    if (!empty($dateRaw) && $dateRaw !== '0000-00-00') {
        $ts = strtotime($dateRaw);
        if ($ts !== false && (int)date('Y', $ts) > 1970) {
            $formattedDate = date('j F, l', $ts);
        }
    }

    $timeVal = !empty($row['time']) ? trim((string)$row['time']) : '8:00 AM';
    if (is_numeric($timeVal)) {
        $timeVal = $timeVal . ':00 AM';
    }

    $durationText = !empty($row['duration_text']) ? trim((string)$row['duration_text']) : '90 mins';
    if ($durationText === 'month' || $durationText === '1 month') {
        $durationText = 'One Month Workshop';
    }

    // Speaker / Doctor name
    $speakerName = !empty($row['speaker']) ? trim((string)$row['speaker']) : (!empty($row['assign_speaker']) ? trim((string)$row['assign_speaker']) : (!empty($row['instructor']) ? trim((string)$row['instructor']) : 'Dr. Nidhi Jha'));
    $speakerRole = !empty($row['speaker_role']) ? trim((string)$row['speaker_role']) : 'Ayurveda Physician';
    $speakerBio = !empty($row['speaker_bio']) ? trim((string)$row['speaker_bio']) : "{$speakerName} is an expert Ayurvedic practitioner specializing in holistic lifestyle management, preventative health protocols, and patient-centric therapies.";

    // About description
    $aboutText = !empty($row['about']) ? trim((string)$row['about']) : (!empty($row['subtitle']) ? trim((string)$row['subtitle']) : 'A comprehensive interactive workshop covering authentic Ayurvedic health strategies, nutrition guides, and lifestyle routines.');

    // Image resolution
    $img = !empty($row['image_url']) && $row['image_url'] !== 'assets/package-thumb.jpg' ? $row['image_url'] : 'assets/courses/course_ayurveda_herbs.jpg';

    // Attendee Type
    $attendeeType = !empty($row['attendee_type']) ? trim((string)$row['attendee_type']) : 'Patient';

    return [
        'id' => (int)($row['id'] ?? 0),
        'workshop_id' => $row['workshop_id'] ?? ('WS-' . str_pad($row['id'] ?? '1', 3, '0', STR_PAD_LEFT)),
        'title' => trim((string)($row['title'] ?? '')),
        'subtitle' => trim((string)($row['subtitle'] ?? 'Holistic Health & Ayurveda Insights')),
        'instructor' => trim((string)($row['instructor'] ?? $speakerName)),
        'speaker' => $speakerName,
        'assign_speaker' => $speakerName,
        'speaker_role' => $speakerRole,
        'speaker_bio' => $speakerBio,
        'speaker_initials' => getInitialsFromName($speakerName),
        'attendee_type' => $attendeeType,
        'date' => $dateRaw ?: date('Y-m-d'),
        'formatted_date' => $formattedDate,
        'time' => $timeVal,
        'duration_text' => $durationText,
        'location' => !empty($row['location']) ? trim((string)$row['location']) : 'Ocayur Center / Hybrid Online',
        'meet_link' => !empty($row['meet_link']) ? trim((string)$row['meet_link']) : 'https://meet.google.com/xyz-abcd-efg',
        'capacity' => (int)($row['capacity'] ?? 50),
        'enrolled' => (int)($row['enrolled'] ?? 0),
        'registrations' => (int)($row['registrations'] ?? 0),
        'price' => $feeVal,
        'fee' => $feeVal,
        'fee_formatted' => $feeFormatted,
        'about' => $aboutText,
        'image_url' => $img,
        'status' => !empty($row['status']) ? trim((string)$row['status']) : 'Upcoming'
    ];
}



$input = [];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        $decoded = json_decode($rawInput, true);
        if (is_array($decoded)) {
            $input = $decoded;
        }
    }
    if (empty($input)) {
        $input = $_POST;
    }
}

$action = isset($_GET['action']) ? trim($_GET['action']) : (isset($input['action']) ? trim($input['action']) : 'list');

// --------------------------------------------------------------------------
// 1. POST WORKSHOP REGISTRATION / BOOKING
// --------------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'POST' || $action === 'register' || $action === 'book') {
    $wsId = isset($input['workshop_id']) ? trim((string)$input['workshop_id']) : (isset($_POST['workshop_id']) ? trim((string)$_POST['workshop_id']) : '');
    $wsNumericId = isset($input['id']) ? intval($input['id']) : (isset($_POST['id']) ? intval($_POST['id']) : 0);
    $wsTitle = isset($input['workshop_title']) ? trim((string)$input['workshop_title']) : (isset($input['title']) ? trim((string)$input['title']) : '');
    $patientName = !empty($input['patient_name']) ? trim((string)$input['patient_name']) : ($_SESSION['full_name'] ?? 'Patient');
    $patientEmail = !empty($input['patient_email']) ? trim((string)$input['patient_email']) : ($_SESSION['email'] ?? '');
    $patientPhone = !empty($input['patient_phone']) ? trim((string)$input['patient_phone']) : ($_SESSION['phone_number'] ?? '');
    $patientId = isset($input['patient_id']) ? intval($input['patient_id']) : (isset($_SESSION['patient_id']) ? intval($_SESSION['patient_id']) : 1);
    $paymentMethod = isset($input['payment_method']) ? trim((string)$input['payment_method']) : 'Card';
    $amount = isset($input['amount']) ? (float)$input['amount'] : 500.00;
    $date = isset($input['date']) ? trim((string)$input['date']) : date('j F Y');
    $time = isset($input['time']) ? trim((string)$input['time']) : '08:00 AM';

    // Find numeric workshop ID if only string wsId or title was provided
    if ($connection1 && $wsNumericId <= 0 && (!empty($wsId) || !empty($wsTitle))) {
        $findStmt = mysqli_prepare($connection1, "SELECT id, fee, price, title FROM workshops WHERE id = ? OR workshop_id = ? OR title = ? LIMIT 1");
        if ($findStmt) {
            $wsIdInt = intval($wsId);
            mysqli_stmt_bind_param($findStmt, "iss", $wsIdInt, $wsId, $wsTitle);
            mysqli_stmt_execute($findStmt);
            $fRes = mysqli_stmt_get_result($findStmt);
            if ($fRow = mysqli_fetch_assoc($fRes)) {
                $wsNumericId = (int)$fRow['id'];
                if (empty($wsTitle)) $wsTitle = $fRow['title'];
            }
            mysqli_stmt_close($findStmt);
        }
    }

    // Clean phone number for matching
    $cleanPhone = preg_replace('/\D/', '', $patientPhone);
    if (strlen($cleanPhone) > 10 && substr($cleanPhone, 0, 2) === '91') {
        $cleanPhone = substr($cleanPhone, 2);
    }

    // Check if patient is ALREADY registered in this workshop to prevent duplicate registration
    if ($connection1 && $wsNumericId > 0) {
        $chkQuery = "SELECT id, booking_id, booking_date FROM `workshop_bookings` 
                     WHERE `workshop_id` = ? 
                     AND `payment_status` = 'Success'
                     AND (
                       (`doctor_id` = ? AND ? > 0) OR 
                       (`doctor_phone` = ? AND ? != '') OR 
                       (`doctor_phone` = ? AND ? != '') OR 
                       (`doctor_email` = ? AND ? != '')
                     ) 
                     LIMIT 1";
        if ($chkStmt = mysqli_prepare($connection1, $chkQuery)) {
            mysqli_stmt_bind_param($chkStmt, "iiissssss", 
                $wsNumericId,
                $patientId, $patientId, 
                $patientPhone, $patientPhone, 
                $cleanPhone, $cleanPhone, 
                $patientEmail, $patientEmail
            );
            mysqli_stmt_execute($chkStmt);
            $chkRes = mysqli_stmt_get_result($chkStmt);
            if ($chkRes && ($existingBooking = mysqli_fetch_assoc($chkRes))) {
                mysqli_stmt_close($chkStmt);
                sendJsonResponse(false, 'You have already registered for this workshop.', [
                    'already_registered' => true,
                    'booking_id' => $existingBooking['booking_id'],
                    'workshop_id' => $wsNumericId,
                    'workshop_title' => $wsTitle ?: 'Ayurveda Workshop',
                    'booking_date' => $existingBooking['booking_date']
                ], 400);
            }
            mysqli_stmt_close($chkStmt);
        }
    }

    $bookingId = '#' . rand(100000, 999999);

    // Insert into workshop_bookings in MySQL
    if ($connection1 && $wsNumericId > 0) {
        $insQuery = "INSERT INTO `workshop_bookings` 
            (`booking_id`, `workshop_id`, `doctor_id`, `doctor_name`, `doctor_email`, `doctor_phone`, `amount`, `payment_method`, `payment_status`, `booking_date`)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Success', NOW())";
        if ($stmt = mysqli_prepare($connection1, $insQuery)) {
            mysqli_stmt_bind_param($stmt, "siisssds", 
                $bookingId, $wsNumericId, $patientId, $patientName, $patientEmail, $patientPhone, $amount, $paymentMethod
            );
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }

        // Increment registrations count in workshops table
        $upQuery = "UPDATE workshops SET registrations = registrations + 1 WHERE id = ?";
        if ($stmt = mysqli_prepare($connection1, $upQuery)) {
            mysqli_stmt_bind_param($stmt, "i", $wsNumericId);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
    }

    sendJsonResponse(true, 'Workshop registration completed successfully!', [
        'booking_id' => $bookingId,
        'workshop_title' => $wsTitle ?: 'Ayurveda Workshop',
        'patient_name' => $patientName,
        'patient_email' => $patientEmail,
        'patient_phone' => $patientPhone,
        'payment_method' => $paymentMethod,
        'amount' => $amount,
        'formatted_amount' => '₹' . number_format($amount, 2),
        'date' => $date,
        'time' => $time,
        'status' => 'Confirmed'
    ]);
}

// --------------------------------------------------------------------------
// 2. GET MY REGISTERED WORKSHOPS (action = my_workshops)
// --------------------------------------------------------------------------
if ($action === 'my_workshops') {
    $patientPhone = trim((string)($_GET['phone'] ?? $_GET['patient_phone'] ?? $_SESSION['phone_number'] ?? ''));
    $patientEmail = trim((string)($_GET['email'] ?? $_GET['patient_email'] ?? $_SESSION['email'] ?? ''));
    $patientId = intval($_GET['patient_id'] ?? $_GET['id'] ?? $_SESSION['patient_id'] ?? 0);

    // Clean phone number
    $cleanPhone = preg_replace('/\D/', '', $patientPhone);
    if (strlen($cleanPhone) > 10 && substr($cleanPhone, 0, 2) === '91') {
        $cleanPhone = substr($cleanPhone, 2);
    }

    $myWorkshops = [];

    if ($connection1) {
        $query = "SELECT wb.*, w.workshop_id as ws_code, w.title as ws_title, w.subtitle as ws_subtitle, 
                         w.time as ws_time, w.date as ws_date, w.meet_link as ws_meet_link, 
                         w.image_url as ws_image, w.fee as ws_fee, w.price as ws_price, 
                         w.speaker, w.assign_speaker, w.instructor
                  FROM `workshop_bookings` wb
                  LEFT JOIN `workshops` w ON wb.workshop_id = w.id
                  WHERE (
                    (wb.doctor_id = ? AND ? > 0) OR 
                    (wb.doctor_phone = ? AND ? != '') OR 
                    (wb.doctor_phone = ? AND ? != '') OR 
                    (wb.doctor_email = ? AND ? != '')
                  )
                  AND wb.payment_status = 'Success'
                  ORDER BY wb.id DESC";

        if ($stmt = mysqli_prepare($connection1, $query)) {
            mysqli_stmt_bind_param($stmt, "iissssss", 
                $patientId, $patientId, 
                $patientPhone, $patientPhone, 
                $cleanPhone, $cleanPhone, 
                $patientEmail, $patientEmail
            );
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            if ($res) {
                while ($row = mysqli_fetch_assoc($res)) {
                    $feeNum = floatval(($row['amount'] ?? 0) > 0 ? $row['amount'] : (($row['ws_fee'] ?? 0) > 0 ? $row['ws_fee'] : 499.00));
                    $dateRaw = !empty($row['ws_date']) ? $row['ws_date'] : $row['booking_date'];
                    $formattedDate = '3 September, Wednesday';
                    if (!empty($dateRaw) && $dateRaw !== '0000-00-00') {
                        $ts = strtotime($dateRaw);
                        if ($ts !== false && (int)date('Y', $ts) > 1970) {
                            $formattedDate = date('j F, l', $ts);
                        }
                    }

                    $meetLink = !empty($row['ws_meet_link']) ? $row['ws_meet_link'] : 'https://meet.google.com/abc-xyz-pqrs';
                    $rawImg = !empty($row['ws_image']) ? $row['ws_image'] : 'assets/courses/course_ayurveda_herbs.jpg';

                    $myWorkshops[] = [
                        'id' => (int)$row['id'],
                        'booking_id' => $row['booking_id'],
                        'workshop_id' => (int)($row['workshop_id'] ?? 0),
                        'title' => !empty($row['ws_title']) ? $row['ws_title'] : 'Ayurveda Workshop',
                        'price' => '₹' . number_format($feeNum, 0) . '/-',
                        'fee' => $feeNum,
                        'date' => $formattedDate,
                        'time' => !empty($row['ws_time']) ? $row['ws_time'] : '8:00 AM',
                        'meet_link' => $meetLink,
                        'image_url' => $rawImg
                    ];
                }
            }
            mysqli_stmt_close($stmt);
        }
    }

    sendJsonResponse(true, 'My registered workshops fetched successfully.', [
        'count' => count($myWorkshops),
        'workshops' => $myWorkshops
    ]);
}

// --------------------------------------------------------------------------
// 2B. CHECK IF PATIENT IS REGISTERED (action = check_registration)
// --------------------------------------------------------------------------
if ($action === 'check_registration') {
    $wsId = isset($_GET['workshop_id']) ? trim((string)$_GET['workshop_id']) : '';
    $wsNumericId = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $wsTitle = isset($_GET['title']) ? trim((string)$_GET['title']) : '';
    $patientPhone = trim((string)($_GET['phone'] ?? $_GET['patient_phone'] ?? $_SESSION['phone_number'] ?? ''));
    $patientEmail = trim((string)($_GET['email'] ?? $_GET['patient_email'] ?? $_SESSION['email'] ?? ''));
    $patientId = intval($_GET['patient_id'] ?? $_SESSION['patient_id'] ?? 0);

    $cleanPhone = preg_replace('/\D/', '', $patientPhone);
    if (strlen($cleanPhone) > 10 && substr($cleanPhone, 0, 2) === '91') {
        $cleanPhone = substr($cleanPhone, 2);
    }

    $isRegistered = false;
    $bookingData = null;

    if ($connection1) {
        if ($wsNumericId <= 0 && (!empty($wsId) || !empty($wsTitle))) {
            $findStmt = mysqli_prepare($connection1, "SELECT id, title FROM workshops WHERE id = ? OR workshop_id = ? OR title = ? LIMIT 1");
            if ($findStmt) {
                $wsIdInt = intval($wsId);
                mysqli_stmt_bind_param($findStmt, "iss", $wsIdInt, $wsId, $wsTitle);
                mysqli_stmt_execute($findStmt);
                $fRes = mysqli_stmt_get_result($findStmt);
                if ($fRow = mysqli_fetch_assoc($fRes)) {
                    $wsNumericId = (int)$fRow['id'];
                }
                mysqli_stmt_close($findStmt);
            }
        }

        if ($wsNumericId > 0 && (!empty($patientPhone) || !empty($cleanPhone) || !empty($patientEmail) || $patientId > 0)) {
            $chkQuery = "SELECT wb.id, wb.booking_id, wb.booking_date, w.meet_link 
                         FROM `workshop_bookings` wb
                         LEFT JOIN `workshops` w ON wb.workshop_id = w.id
                         WHERE wb.workshop_id = ? 
                         AND wb.payment_status = 'Success'
                         AND (
                           (wb.doctor_id = ? AND ? > 0) OR 
                           (wb.doctor_phone = ? AND ? != '') OR 
                           (wb.doctor_phone = ? AND ? != '') OR 
                           (wb.doctor_email = ? AND ? != '')
                         ) 
                         LIMIT 1";
            if ($chkStmt = mysqli_prepare($connection1, $chkQuery)) {
                mysqli_stmt_bind_param($chkStmt, "iiissssss", 
                    $wsNumericId,
                    $patientId, $patientId, 
                    $patientPhone, $patientPhone, 
                    $cleanPhone, $cleanPhone, 
                    $patientEmail, $patientEmail
                );
                mysqli_stmt_execute($chkStmt);
                $chkRes = mysqli_stmt_get_result($chkStmt);
                if ($chkRes && ($row = mysqli_fetch_assoc($chkRes))) {
                    $isRegistered = true;
                    $bookingData = $row;
                }
                mysqli_stmt_close($chkStmt);
            }
        }
    }

    sendJsonResponse(true, 'Registration status checked.', [
        'is_registered' => $isRegistered,
        'booking' => $bookingData
    ]);
}

// --------------------------------------------------------------------------
// 3. GET WORKSHOP DETAILS (action = details or ID provided)
// --------------------------------------------------------------------------
$queryId = isset($_GET['id']) ? intval($_GET['id']) : 0;
$queryWsId = isset($_GET['workshop_id']) ? trim((string)$_GET['workshop_id']) : '';
$queryTitle = isset($_GET['title']) ? trim((string)$_GET['title']) : '';

if ($action === 'details' || ($queryId > 0 || !empty($queryWsId) || !empty($queryTitle))) {
    $id = $queryId;
    $wsId = $queryWsId;
    $title = $queryTitle;

    $workshop = null;

    if ($connection1 && ($id > 0 || !empty($wsId) || !empty($title))) {
        // Query workshop filtering for Patient, Both, or All attendee type (exclude doctor-only)
        $query = "SELECT * FROM workshops WHERE (id = ? OR workshop_id = ? OR title = ?) AND LOWER(TRIM(attendee_type)) != 'doctor' LIMIT 1";
        if ($stmt = mysqli_prepare($connection1, $query)) {
            mysqli_stmt_bind_param($stmt, "iss", $id, $wsId, $title);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            if ($res && $row = mysqli_fetch_assoc($res)) {
                $workshop = formatWorkshopRecord($row);
            }
            mysqli_stmt_close($stmt);
        }
    }

    if ($workshop) {
        $patientPhone = trim((string)($_GET['phone'] ?? $_GET['patient_phone'] ?? $_SESSION['phone_number'] ?? ''));
        $patientEmail = trim((string)($_GET['email'] ?? $_GET['patient_email'] ?? $_SESSION['email'] ?? ''));
        $patientId = intval($_GET['patient_id'] ?? $_SESSION['patient_id'] ?? 0);

        $cleanPhone = preg_replace('/\D/', '', $patientPhone);
        if (strlen($cleanPhone) > 10 && substr($cleanPhone, 0, 2) === '91') {
            $cleanPhone = substr($cleanPhone, 2);
        }

        $workshop['is_registered'] = false;
        if ($connection1 && ($workshop['id'] > 0) && (!empty($patientPhone) || !empty($cleanPhone) || !empty($patientEmail) || $patientId > 0)) {
            $chkQuery = "SELECT id, booking_id FROM workshop_bookings 
                         WHERE workshop_id = ? 
                         AND payment_status = 'Success' 
                         AND (
                           (doctor_id = ? AND ? > 0) OR 
                           (doctor_phone = ? AND ? != '') OR 
                           (doctor_phone = ? AND ? != '') OR 
                           (doctor_email = ? AND ? != '')
                         ) LIMIT 1";
            if ($chkStmt = mysqli_prepare($connection1, $chkQuery)) {
                $wsNum = (int)$workshop['id'];
                mysqli_stmt_bind_param($chkStmt, "iiissssss", 
                    $wsNum,
                    $patientId, $patientId, 
                    $patientPhone, $patientPhone, 
                    $cleanPhone, $cleanPhone, 
                    $patientEmail, $patientEmail
                );
                mysqli_stmt_execute($chkStmt);
                $chkRes = mysqli_stmt_get_result($chkStmt);
                if ($chkRes && ($chkRow = mysqli_fetch_assoc($chkRes))) {
                    $workshop['is_registered'] = true;
                    $workshop['booking_id'] = $chkRow['booking_id'];
                }
                mysqli_stmt_close($chkStmt);
            }
        }

        sendJsonResponse(true, 'Workshop details retrieved successfully.', ['workshop' => $workshop]);
    } else {
        sendJsonResponse(false, 'Workshop not found.', [], 404);
    }
}

// --------------------------------------------------------------------------
// 4. GET LIST OF WORKSHOPS FOR PATIENT PORTAL (action = list / default)
// Workshops where attendee_type is 'Patient' or 'Both' / 'All' (Doctor-only workshops are excluded)
// --------------------------------------------------------------------------
$workshops = [];

if ($connection1) {
    // If patient identity is passed, fetch all workshop IDs the patient is already enrolled in
    $patientPhone = trim((string)($_GET['phone'] ?? $_GET['patient_phone'] ?? $_SESSION['phone_number'] ?? ''));
    $patientEmail = trim((string)($_GET['email'] ?? $_GET['patient_email'] ?? $_SESSION['email'] ?? ''));
    $patientId = intval($_GET['patient_id'] ?? $_SESSION['patient_id'] ?? 0);

    $cleanPhone = preg_replace('/\D/', '', $patientPhone);
    if (strlen($cleanPhone) > 10 && substr($cleanPhone, 0, 2) === '91') {
        $cleanPhone = substr($cleanPhone, 2);
    }

    $bookedWorkshopIds = [];
    if (!empty($patientPhone) || !empty($cleanPhone) || !empty($patientEmail) || $patientId > 0) {
        $bQuery = "SELECT DISTINCT workshop_id FROM workshop_bookings 
                   WHERE payment_status = 'Success' 
                   AND (
                     (doctor_id = ? AND ? > 0) OR 
                     (doctor_phone = ? AND ? != '') OR 
                     (doctor_phone = ? AND ? != '') OR 
                     (doctor_email = ? AND ? != '')
                   )";
        if ($bStmt = mysqli_prepare($connection1, $bQuery)) {
            mysqli_stmt_bind_param($bStmt, "iissssss", 
                $patientId, $patientId, 
                $patientPhone, $patientPhone, 
                $cleanPhone, $cleanPhone, 
                $patientEmail, $patientEmail
            );
            mysqli_stmt_execute($bStmt);
            $bRes = mysqli_stmt_get_result($bStmt);
            if ($bRes) {
                while ($bRow = mysqli_fetch_assoc($bRes)) {
                    $bookedWorkshopIds[] = (int)$bRow['workshop_id'];
                }
            }
            mysqli_stmt_close($bStmt);
        }
    }

    // Select workshops with attendee_type = 'Patient' or 'Both' / 'All' or unassigned (exclude doctor-only)
    $sql = "SELECT * FROM workshops WHERE `status` != 'Cancelled' AND (LOWER(TRIM(attendee_type)) IN ('patient', 'both', 'all', '') OR attendee_type IS NULL OR attendee_type LIKE '%patient%' OR attendee_type LIKE '%both%' OR attendee_type LIKE '%all%') AND LOWER(TRIM(attendee_type)) != 'doctor' ORDER BY date ASC, id ASC";
    $result = mysqli_query($connection1, $sql);

    if ($result) {
        while ($row = mysqli_fetch_assoc($result)) {
            $att = strtolower(trim((string)($row['attendee_type'] ?? '')));
            if ($att !== 'doctor') {
                $formatted = formatWorkshopRecord($row);
                $formatted['is_registered'] = in_array((int)$row['id'], $bookedWorkshopIds, true);
                $workshops[] = $formatted;
            }
        }
    }
}

sendJsonResponse(true, 'Patient workshops fetched successfully.', [
    'count' => count($workshops),
    'attendee_type' => 'Patient, Both',
    'workshops' => $workshops
]);
