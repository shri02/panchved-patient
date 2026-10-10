<?php
/**
 * Panchved Patient Portal - Create Account API
 * Handles 3-step registration flow:
 * 1. Personal Details (Full Name, DOB, Gender, Height, Weight)
 * 2. Prakruti Parikshan (Appetite, Sleep Type, Dream, Skin Type, Hair Type)
 * 3. Security Credentials (Password)
 * Creates records in `users` and `patients` tables according to schema.sql.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
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

// Read raw JSON or POST data
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
if (!$data || !is_array($data)) {
    $data = $_POST;
}

// Phone availability check endpoint
if (isset($_GET['check_phone']) || (isset($data['action']) && $data['action'] === 'check_phone')) {
    $checkPhone = isset($_GET['check_phone']) ? trim($_GET['check_phone']) : (isset($data['phone']) ? trim($data['phone']) : '');
    $phoneDigits = preg_replace('/[^\d]/', '', $checkPhone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    if (strlen($phoneDigits) === 10) {
        $uCheck = mysqli_prepare($connection1, "SELECT id FROM users WHERE phone_number = ? LIMIT 1");
        if ($uCheck) {
            mysqli_stmt_bind_param($uCheck, "s", $phoneDigits);
            mysqli_stmt_execute($uCheck);
            $uRes = mysqli_stmt_get_result($uCheck);
            $uFound = mysqli_fetch_assoc($uRes);
            mysqli_stmt_close($uCheck);

            if ($uFound) {
                sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['exists' => true]);
            }
        }

        $pCheck = mysqli_prepare($connection1, "SELECT id FROM patients WHERE phone_number = ? LIMIT 1");
        if ($pCheck) {
            mysqli_stmt_bind_param($pCheck, "s", $phoneDigits);
            mysqli_stmt_execute($pCheck);
            $pRes = mysqli_stmt_get_result($pCheck);
            $pFound = mysqli_fetch_assoc($pRes);
            mysqli_stmt_close($pCheck);

            if ($pFound) {
                sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['exists' => true]);
            }
        }

        sendJsonResponse(true, 'Phone number is available.', ['exists' => false]);
    }
    sendJsonResponse(true, 'Phone number required.', ['exists' => false]);
}

// Step 1: Personal Details
$fullName = isset($data['fullName']) ? trim($data['fullName']) : (isset($data['full_name']) ? trim($data['full_name']) : '');
$dobRaw = isset($data['dob']) ? trim($data['dob']) : '';
$genderRaw = isset($data['gender']) ? strtolower(trim($data['gender'])) : 'male';
$height = isset($data['height']) ? trim($data['height']) : '';
$weight = isset($data['weight']) ? trim($data['weight']) : '';
$phone = isset($data['phone']) ? trim($data['phone']) : (isset($data['phoneNumber']) ? trim($data['phoneNumber']) : (isset($data['phone_number']) ? trim($data['phone_number']) : ''));
$email = isset($data['email']) ? trim($data['email']) : '';

// Step 2: Prakruti Parikshan
$appetite = isset($data['appetite']) ? trim($data['appetite']) : 'normal';
$sleepType = isset($data['sleepType']) ? trim($data['sleepType']) : 'normal';
$dream1 = isset($data['dream1']) ? trim($data['dream1']) : 'water';
$skinType = isset($data['skinType']) ? trim($data['skinType']) : 'normal';
$hairType = isset($data['hairType']) ? trim($data['hairType']) : 'normal';
$bowelMovement = isset($data['bowelMovement']) ? trim($data['bowelMovement']) : (isset($data['bowel_movement']) ? trim($data['bowel_movement']) : 'once_comfortable');

// Step 3: Security Credentials
$password = isset($data['password']) ? $data['password'] : (isset($data['newPassword']) ? $data['newPassword'] : '');
$confirmPassword = isset($data['confirmPassword']) ? $data['confirmPassword'] : (isset($data['confirm_password']) ? $data['confirm_password'] : '');

// Basic validations
if (empty($fullName)) {
    sendJsonResponse(false, 'Please enter your full name.', [], 400);
}

if (empty($email)) {
    sendJsonResponse(false, 'Please enter your email address.', [], 400);
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    sendJsonResponse(false, 'Please provide a valid email address.', [], 400);
}

if (empty($password)) {
    sendJsonResponse(false, 'Please set a secure password.', [], 400);
}

if (strlen($password) < 6) {
    sendJsonResponse(false, 'Password must be at least 6 characters long.', [], 400);
}

if (!empty($confirmPassword) && $password !== $confirmPassword) {
    sendJsonResponse(false, 'New password and confirm password do not match.', [], 400);
}

// Phone number validation and normalization
$phoneDigits = preg_replace('/[^\d]/', '', $phone);
if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
    $phoneDigits = substr($phoneDigits, 2);
}

if (empty($phoneDigits) || strlen($phoneDigits) < 10) {
    sendJsonResponse(false, 'Please enter a valid 10-digit phone number.', [], 400);
}

// Gender normalization
$gender = 'Male';
if ($genderRaw === 'female') {
    $gender = 'Female';
} elseif ($genderRaw === 'other') {
    $gender = 'Other';
}

// Date of Birth & Age Calculation
$formattedDob = '1995-05-15';
$age = 29;

if (!empty($dobRaw)) {
    // Supports dd/mm/yy, dd/mm/yyyy, yyyy-mm-dd
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/', $dobRaw, $matches)) {
        $day = str_pad($matches[1], 2, '0', STR_PAD_LEFT);
        $month = str_pad($matches[2], 2, '0', STR_PAD_LEFT);
        $year = $matches[3];
        if (strlen($year) === 2) {
            $currentYearShort = (int)date('y');
            $year = ((int)$year > $currentYearShort) ? ('19' . $year) : ('20' . $year);
        }
        $formattedDob = "$year-$month-$day";
    } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $dobRaw)) {
        $formattedDob = $dobRaw;
    }

    $dobDate = date_create($formattedDob);
    if ($dobDate) {
        $diff = date_diff($dobDate, date_create('today'));
        $age = $diff->y > 0 ? $diff->y : 25;
    }
}

// Generate email if empty
if (empty($email)) {
    $cleanName = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $fullName));
    $email = $cleanName . substr($phoneDigits, -4) . '@gmail.com';
}

// Username
$username = $phoneDigits;

// Compute Prakruti Profile Assessment
$vataScore = 0;
$pittaScore = 0;
$kaphaScore = 0;

if ($appetite === 'irregular') $vataScore += 2;
elseif ($appetite === 'very_good') $pittaScore += 2;
elseif ($appetite === 'poor') $kaphaScore += 2;
else { $pittaScore += 1; }

if ($sleepType === 'light' || $sleepType === 'disturbed') $vataScore += 2;
elseif ($sleepType === 'owl') $pittaScore += 2;
elseif ($sleepType === 'deep') $kaphaScore += 2;
else { $pittaScore += 1; }

if ($dream1 === 'flying') $vataScore += 2;
elseif ($dream1 === 'fire') $pittaScore += 2;
elseif ($dream1 === 'water') $kaphaScore += 2;
elseif ($dream1 === 'vivid') { $vataScore += 1; $pittaScore += 1; }

if ($skinType === 'dry_rough') $vataScore += 2;
elseif ($skinType === 'sensitive') $pittaScore += 2;
elseif ($skinType === 'oily' || $skinType === 'soft_moist') $kaphaScore += 2;

if ($hairType === 'dry_frizzy') $vataScore += 2;
elseif ($hairType === 'thinning') $pittaScore += 2;
elseif ($hairType === 'thick_wavy' || $hairType === 'oily_fine') $kaphaScore += 2;

if ($bowelMovement === 'hard_dry' || $bowelMovement === 'less_than_once') $vataScore += 2;
elseif ($bowelMovement === 'loose_urgent' || $bowelMovement === 'more_than_once') $pittaScore += 2;
elseif ($bowelMovement === 'once_comfortable') { $pittaScore += 1; $kaphaScore += 1; }

$profileType = 'Agni';
$profileDescription = 'Your assessment indicates Agni. Your responses suggest that digestion, sleep and stress management may be important areas to focus on.';

if ($pittaScore >= $vataScore && $pittaScore >= $kaphaScore && $pittaScore >= 4) {
    $profileType = 'Agni / Pitta';
    $profileDescription = 'Your assessment indicates strong metabolic Agni with Pitta characteristics. Your responses suggest focusing on cooling dinacharya, liver vitality, and balanced nutrition.';
} elseif ($vataScore > $pittaScore && $vataScore >= $kaphaScore) {
    $profileType = 'Vata-Agni';
    $profileDescription = 'Your assessment indicates Vata variability in Agni. Focus on warm nourishing meals, regular sleep routine, and nervous system relaxation.';
} elseif ($kaphaScore > $pittaScore && $kaphaScore > $vataScore) {
    $profileType = 'Kapha-Agni';
    $profileDescription = 'Your assessment indicates steady Kapha constitution. Focus on metabolic boosting herbs, active physical exercise, and light digestive spices.';
}

// Generate Next Unique Patient ID (e.g. P011, P012...)
$patientIdQuery = "SELECT patient_id FROM patients WHERE patient_id LIKE 'P%' ORDER BY id DESC LIMIT 1";
$pidRes = mysqli_query($connection1, $patientIdQuery);
$nextNum = 11;

if ($pidRes && $pRow = mysqli_fetch_assoc($pidRes)) {
    if (preg_match('/P(\d+)/', $pRow['patient_id'], $m)) {
        $nextNum = intval($m[1]) + 1;
    }
}
$newPatientId = 'P' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);

// Password Bcrypt Hash
$passwordHash = password_hash($password, PASSWORD_BCRYPT);

// Check if phone number is already registered
$checkPhoneUser = "SELECT id, username FROM users WHERE phone_number = ? LIMIT 1";
$uCheckStmt = mysqli_prepare($connection1, $checkPhoneUser);
mysqli_stmt_bind_param($uCheckStmt, "s", $phoneDigits);
mysqli_stmt_execute($uCheckStmt);
$uCheckRes = mysqli_stmt_get_result($uCheckStmt);
$existingPhoneUser = mysqli_fetch_assoc($uCheckRes);
mysqli_stmt_close($uCheckStmt);

if ($existingPhoneUser) {
    sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['phone_exists' => true], 409);
}

$checkPhonePat = "SELECT id, patient_id FROM patients WHERE phone_number = ? LIMIT 1";
$pCheckStmt = mysqli_prepare($connection1, $checkPhonePat);
mysqli_stmt_bind_param($pCheckStmt, "s", $phoneDigits);
mysqli_stmt_execute($pCheckStmt);
$pCheckRes = mysqli_stmt_get_result($pCheckStmt);
$existingPhonePat = mysqli_fetch_assoc($pCheckRes);
mysqli_stmt_close($pCheckStmt);

if ($existingPhonePat) {
    sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['phone_exists' => true], 409);
}

// 1. Insert into `users` table
$userId = null;
$insertUser = "INSERT INTO users (username, full_name, email, phone_number, password_hash, role, status, last_login) VALUES (?, ?, ?, ?, ?, 'Patient', 'Active', NOW())";
$uInStmt = mysqli_prepare($connection1, $insertUser);
if ($uInStmt) {
    mysqli_stmt_bind_param($uInStmt, "sssss", $username, $fullName, $email, $phoneDigits, $passwordHash);
    mysqli_stmt_execute($uInStmt);
    $userId = mysqli_insert_id($connection1);
    mysqli_stmt_close($uInStmt);
}

// 2. Insert into `patients` table
$patientRecordId = null;
$finalPatientId = $newPatientId;
$insertPat = "INSERT INTO patients (patient_id, full_name, dob, age, phone_number, gender, email, package_name, total_appointments, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'Ayurveda Holistic Care', 0, 'Ongoing')";
$pInStmt = mysqli_prepare($connection1, $insertPat);
if ($pInStmt) {
    mysqli_stmt_bind_param($pInStmt, "sssisss", $newPatientId, $fullName, $formattedDob, $age, $phoneDigits, $gender, $email);
    mysqli_stmt_execute($pInStmt);
    $patientRecordId = mysqli_insert_id($connection1);
    mysqli_stmt_close($pInStmt);
}

// 3. Set Session Variables
$_SESSION['user_id'] = $userId;
$_SESSION['username'] = $username;
$_SESSION['full_name'] = $fullName;
$_SESSION['phone_number'] = $phoneDigits;
$_SESSION['email'] = $email;
$_SESSION['role'] = 'Patient';
$_SESSION['patient_id'] = $finalPatientId;

// Send Success Response
sendJsonResponse(true, 'Account created successfully! Welcome to Panchved.', [
    'user' => [
        'id' => (int)$userId,
        'username' => $username,
        'full_name' => $fullName,
        'email' => $email,
        'phone_number' => $phoneDigits,
        'role' => 'Patient'
    ],
    'patient' => [
        'id' => (int)$patientRecordId,
        'patient_id' => $finalPatientId,
        'full_name' => $fullName,
        'dob' => $formattedDob,
        'age' => $age,
        'gender' => $gender,
        'phone_number' => $phoneDigits,
        'email' => $email,
        'height' => $height,
        'weight' => $weight,
        'package_name' => 'Ayurveda Holistic Care',
        'status' => 'Ongoing'
    ],
    'prakruti_result' => [
        'type' => $profileType,
        'title' => $profileType,
        'description' => $profileDescription,
        'vata_score' => $vataScore,
        'pitta_score' => $pittaScore,
        'kapha_score' => $kaphaScore
    ]
], 201);
