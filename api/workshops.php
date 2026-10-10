<?php
/**
 * Panchved Patient Portal - Workshops Backend API
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
      `location` VARCHAR(150) NOT NULL DEFAULT 'Panchved Center / Hybrid Online',
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
        'location' => !empty($row['location']) ? trim((string)$row['location']) : 'Panchved Center / Hybrid Online',
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

// Fallback patient workshops in case DB is completely unavailable or empty
function getFallbackPatientWorkshops() {
    return [
        [
            'id' => 2,
            'workshop_id' => 'WS-002',
            'title' => 'Skill Development Guide For Ayurveda Doctors',
            'subtitle' => 'Holistic Health & Ayurveda Insights',
            'instructor' => 'Dr. Rajesh Varma',
            'speaker' => 'Dr. Rajesh Varma',
            'assign_speaker' => 'Dr. Rajesh Varma',
            'speaker_role' => 'Ayurveda Physician',
            'speaker_bio' => 'Dr. Rajesh Varma is a seasoned Ayurvedic specialist focusing on preventive routines, herbal formulations, and personalized patient care.',
            'speaker_initials' => 'RV',
            'attendee_type' => 'Patient',
            'date' => '2026-09-03',
            'formatted_date' => '3 September, Wednesday',
            'time' => '8:00 AM',
            'duration_text' => '90 mins',
            'location' => 'Rehab Studio 2',
            'meet_link' => 'https://meet.google.com/bmq-ypeq-eur',
            'capacity' => 40,
            'enrolled' => 0,
            'registrations' => 18,
            'price' => 799.00,
            'fee' => 799.00,
            'fee_formatted' => '₹799/-',
            'about' => 'Understand root triggers, daily nutrition routines, and restorative herbal protocols designed for comprehensive patient health.',
            'image_url' => 'assets/courses/course_ayurveda_herbs.jpg',
            'status' => 'Upcoming'
        ],
        [
            'id' => 3,
            'workshop_id' => 'WS-003',
            'title' => 'Telemedicine Necessities Laws & AI',
            'subtitle' => 'Holistic Health & Ayurveda Insights',
            'instructor' => 'Dr. Sneha Patil',
            'speaker' => 'Dr. Sneha Patil',
            'assign_speaker' => 'Dr. Sneha Patil',
            'speaker_role' => 'Ayurveda Physician',
            'speaker_bio' => 'Dr. Sneha Patil brings extensive clinical experience in integrating traditional wellness science with modern digital consultation platforms.',
            'speaker_initials' => 'SP',
            'attendee_type' => 'Patient',
            'date' => '2026-09-03',
            'formatted_date' => '3 September, Wednesday',
            'time' => '8:00 AM',
            'duration_text' => '90 mins',
            'location' => 'Auditorium & Live Stream',
            'meet_link' => 'https://meet.google.com/bmq-ypeq-eur',
            'capacity' => 100,
            'enrolled' => 0,
            'registrations' => 42,
            'price' => 799.00,
            'fee' => 799.00,
            'fee_formatted' => '₹799/-',
            'about' => 'Explore how patient tele-health protocols and AI wellness aids provide accessible, safe, and round-the-clock Ayurvedic guidance.',
            'image_url' => 'assets/courses/course_telemedicine.jpg',
            'status' => 'Upcoming'
        ],
        [
            'id' => 8,
            'workshop_id' => 'WS-006',
            'title' => 'Pre-Pregnancy Ready – Ayurveda Workshop',
            'subtitle' => 'Prepare Your Body, Mind & Lifestyle for Healthy Conception',
            'instructor' => 'Dr. Nidhi Jha',
            'speaker' => 'Dr. Nidhi Jha',
            'assign_speaker' => 'Dr. Nidhi Jha',
            'speaker_role' => 'Ayurveda Physician',
            'speaker_bio' => 'Dr. Nidhi Jha is a senior Ayurveda practitioner dedicated to mother-child wellness, prenatal care, and reproductive health.',
            'speaker_initials' => 'NJ',
            'attendee_type' => 'Patient',
            'date' => '2026-09-23',
            'formatted_date' => '23 September, Wednesday',
            'time' => '5:00 PM',
            'duration_text' => '90 mins',
            'location' => 'Panchved Center Hall A',
            'meet_link' => 'https://meet.google.com/bey-byer-rty',
            'capacity' => 50,
            'enrolled' => 0,
            'registrations' => 1,
            'price' => 999.00,
            'fee' => 999.00,
            'fee_formatted' => '₹999/-',
            'about' => 'Prepare your body, mind, and daily lifestyle for healthy conception through tailored Ayurvedic nutrition and restorative practices.',
            'image_url' => 'assets/courses/course_pre_pregnancy.jpg',
            'status' => 'Upcoming'
        ]
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
    $wsId = isset($input['workshop_id']) ? trim($input['workshop_id']) : (isset($_POST['workshop_id']) ? trim($_POST['workshop_id']) : '');
    $wsNumericId = isset($input['id']) ? intval($input['id']) : (isset($_POST['id']) ? intval($_POST['id']) : 0);
    $wsTitle = isset($input['workshop_title']) ? trim($input['workshop_title']) : (isset($input['title']) ? trim($input['title']) : '');
    $patientName = isset($input['patient_name']) ? trim($input['patient_name']) : 'John Doe';
    $patientEmail = isset($input['patient_email']) ? trim($input['patient_email']) : 'johndoe@gmail.com';
    $patientPhone = isset($input['patient_phone']) ? trim($input['patient_phone']) : '9876543210';
    $paymentMethod = isset($input['payment_method']) ? trim($input['payment_method']) : 'Card';
    $amount = isset($input['amount']) ? (float)$input['amount'] : 500.00;
    $date = isset($input['date']) ? trim($input['date']) : '2 September 2026';
    $time = isset($input['time']) ? trim($input['time']) : '08:00 AM';

    // Increment workshop registrations in database if exists
    if ($connection1 && ($wsNumericId > 0 || !empty($wsId) || !empty($wsTitle))) {
        $upQuery = "UPDATE workshops SET registrations = registrations + 1 WHERE id = ? OR workshop_id = ? OR title = ? LIMIT 1";
        if ($stmt = mysqli_prepare($connection1, $upQuery)) {
            mysqli_stmt_bind_param($stmt, "iss", $wsNumericId, $wsId, $wsTitle);
            mysqli_stmt_execute($stmt);
            mysqli_stmt_close($stmt);
        }
    }

    $bookingId = '#' . rand(100000, 999999);

    sendJsonResponse(true, 'Workshop registration completed successfully!', [
        'booking_id' => $bookingId,
        'workshop_title' => $wsTitle ?: 'Ayurveda Lifestyle Workshop',
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
// 2. GET WORKSHOP DETAILS (action = details or ID provided)
// --------------------------------------------------------------------------
$queryId = isset($_GET['id']) ? intval($_GET['id']) : 0;
$queryWsId = isset($_GET['workshop_id']) ? trim($_GET['workshop_id']) : '';
$queryTitle = isset($_GET['title']) ? trim($_GET['title']) : '';

if ($action === 'details' || ($queryId > 0 || !empty($queryWsId) || !empty($queryTitle))) {
    $id = $queryId;
    $wsId = $queryWsId;
    $title = $queryTitle;

    $workshop = null;

    if ($connection1 && ($id > 0 || !empty($wsId) || !empty($title))) {
        // Query workshop filtering for Patient or Both attendee type
        $query = "SELECT * FROM workshops WHERE (LOWER(TRIM(attendee_type)) IN ('patient', 'both', 'all') OR attendee_type LIKE '%patient%' OR attendee_type LIKE '%both%' OR attendee_type LIKE '%all%') AND (id = ? OR workshop_id = ? OR title = ?) LIMIT 1";
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

    if (!$workshop) {
        $fallbacks = getFallbackPatientWorkshops();
        foreach ($fallbacks as $fb) {
            if (($id > 0 && $fb['id'] === $id) || (!empty($wsId) && $fb['workshop_id'] === $wsId) || (!empty($title) && strcasecmp($fb['title'], $title) === 0)) {
                $workshop = $fb;
                break;
            }
        }
    }

    if ($workshop) {
        sendJsonResponse(true, 'Workshop details retrieved successfully.', ['workshop' => $workshop]);
    } else {
        sendJsonResponse(false, 'Workshop not found or attendee type is not Patient or Both.', [], 404);
    }
}

// --------------------------------------------------------------------------
// 3. GET LIST OF WORKSHOPS FOR PATIENT PORTAL (action = list / default)
// Workshops where attendee_type is 'Patient' or 'Both' / 'All' (Doctor-only workshops are excluded)
// --------------------------------------------------------------------------
$workshops = [];

if ($connection1) {
    // Select workshops with attendee_type = 'Patient' or 'Both' / 'All' (exclude doctor-only)
    $sql = "SELECT * FROM workshops WHERE (LOWER(TRIM(attendee_type)) IN ('patient', 'both', 'all') OR attendee_type LIKE '%patient%' OR attendee_type LIKE '%both%' OR attendee_type LIKE '%all%') AND LOWER(TRIM(attendee_type)) != 'doctor' ORDER BY id ASC";
    $result = mysqli_query($connection1, $sql);

    if ($result) {
        while ($row = mysqli_fetch_assoc($result)) {
            // Verify attendee_type is Patient or Both
            $att = strtolower(trim((string)($row['attendee_type'] ?? '')));
            if ($att === 'patient' || $att === 'both' || $att === 'all' || stripos($att, 'patient') !== false || stripos($att, 'both') !== false || stripos($att, 'all') !== false) {
                if ($att !== 'doctor') {
                    $workshops[] = formatWorkshopRecord($row);
                }
            }
        }
    }
}

// If no patient workshops found in DB, provide default fallback patient workshops
if (empty($workshops)) {
    $workshops = getFallbackPatientWorkshops();
}

sendJsonResponse(true, 'Patient workshops fetched successfully.', [
    'count' => count($workshops),
    'attendee_type' => 'Patient, Both',
    'workshops' => $workshops
]);
