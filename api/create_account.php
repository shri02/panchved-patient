<?php
/**
 * Ocayur Patient Portal - Create Account API
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

if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
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
if (empty($rawInput) && php_sapi_name() === 'cli') {
    $rawInput = file_get_contents('php://stdin');
}
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
$appetite = isset($data['appetite']) ? trim($data['appetite']) : 'irregular';
$sleepType = isset($data['sleepType']) ? trim($data['sleepType']) : 'moderate';
$skinType = isset($data['skinType']) ? trim($data['skinType']) : 'warm_sensitive';
$hairType = isset($data['hairType']) ? trim($data['hairType']) : 'fine_soft';
$bowelMovement = isset($data['bowelMovement']) ? trim($data['bowelMovement']) : (isset($data['bowel_movement']) ? trim($data['bowel_movement']) : 'regular_frequent');
$stressResponse = isset($data['stressResponse']) ? trim($data['stressResponse']) : (isset($data['stress_response']) ? trim($data['stress_response']) : 'irritability_anger');
$bodyTemperature = isset($data['bodyTemperature']) ? trim($data['bodyTemperature']) : (isset($data['body_temperature']) ? trim($data['body_temperature']) : 'feels_hot');
$physicalActivity = isset($data['physicalActivity']) ? trim($data['physicalActivity']) : (isset($data['physical_activity']) ? trim($data['physical_activity']) : 'active_intense');
$dream1 = isset($data['dream1']) ? trim($data['dream1']) : 'water';

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

// Date of Birth & Auto Calculate Exact Age from DOB
$formattedDob = '1995-05-15';
$age = 31;

if (!empty($dobRaw)) {
    $parsedYear = null;
    $parsedMonth = null;
    $parsedDay = null;

    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/', trim($dobRaw), $matches)) {
        $parsedDay = str_pad($matches[1], 2, '0', STR_PAD_LEFT);
        $parsedMonth = str_pad($matches[2], 2, '0', STR_PAD_LEFT);
        $rawYear = $matches[3];
        if (strlen($rawYear) === 2) {
            $currentYearShort = (int)date('y');
            $parsedYear = ((int)$rawYear > $currentYearShort) ? ('19' . $rawYear) : ('20' . $rawYear);
        } else {
            $parsedYear = $rawYear;
        }
    } elseif (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', trim($dobRaw), $matches)) {
        $parsedYear = $matches[1];
        $parsedMonth = str_pad($matches[2], 2, '0', STR_PAD_LEFT);
        $parsedDay = str_pad($matches[3], 2, '0', STR_PAD_LEFT);
    }

    if ($parsedYear && $parsedMonth && $parsedDay && checkdate((int)$parsedMonth, (int)$parsedDay, (int)$parsedYear)) {
        $formattedDob = sprintf('%04d-%02d-%02d', (int)$parsedYear, (int)$parsedMonth, (int)$parsedDay);
        $dobDate = date_create($formattedDob);
        $today = date_create('today');
        if ($dobDate && $today) {
            $diff = date_diff($dobDate, $today);
            $age = ($diff->invert === 0) ? (int)$diff->y : 0;
        }
    }
} elseif (isset($data['age']) && is_numeric($data['age'])) {
    $age = (int)$data['age'];
}

// Generate email if empty
if (empty($email)) {
    $cleanName = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $fullName));
    $email = $cleanName . substr($phoneDigits, -4) . '@gmail.com';
}

// Username
$username = $phoneDigits;

// Compute Prakruti Profile Assessment based on 8 Clinical Charting Parameters
$vataScore = 0;
$pittaScore = 0;
$kaphaScore = 0;

// 1. Appetite
if (in_array($appetite, ['irregular', 'vata'])) {
    $vataScore++;
} elseif (in_array($appetite, ['strong', 'very_good', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($appetite, ['mild', 'poor', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 2. Sleep Type
if (in_array($sleepType, ['light', 'disturbed', 'vata'])) {
    $vataScore++;
} elseif (in_array($sleepType, ['moderate', 'owl', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($sleepType, ['deep', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 3. Skin Type
if (in_array($skinType, ['dry_rough', 'vata'])) {
    $vataScore++;
} elseif (in_array($skinType, ['warm_sensitive', 'sensitive', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($skinType, ['soft_smooth', 'soft_moist', 'oily', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 4. Hair Type
if (in_array($hairType, ['dry_frizzy', 'vata'])) {
    $vataScore++;
} elseif (in_array($hairType, ['fine_soft', 'thinning', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($hairType, ['thick_dense', 'thick_wavy', 'oily_fine', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 5. Bowel Movement
if (in_array($bowelMovement, ['irregular_constipation', 'hard_dry', 'less_than_once', 'vata'])) {
    $vataScore++;
} elseif (in_array($bowelMovement, ['regular_frequent', 'loose_urgent', 'more_than_once', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($bowelMovement, ['slow_heavy', 'once_comfortable', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 6. Stress Response
if (in_array($stressResponse, ['worry_anxiety', 'vata'])) {
    $vataScore++;
} elseif (in_array($stressResponse, ['irritability_anger', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($stressResponse, ['withdrawal_sluggish', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 7. Body Temperature
if (in_array($bodyTemperature, ['feels_cold', 'vata'])) {
    $vataScore++;
} elseif (in_array($bodyTemperature, ['feels_hot', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($bodyTemperature, ['cool_stable', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// 8. Physical Activity
if (in_array($physicalActivity, ['quick_irregular', 'vata'])) {
    $vataScore++;
} elseif (in_array($physicalActivity, ['active_intense', 'pitta'])) {
    $pittaScore++;
} elseif (in_array($physicalActivity, ['slow_steady', 'kapha'])) {
    $kaphaScore++;
} else {
    $pittaScore++;
}

// Rule from Prakruti charting.docx: Any Dosha having more than 4 ticks falls under that category
$profileType = 'Tridoshic (Sama)';
$profileDescription = '';
$healthTendencies = [];

if ($vataScore > 4) {
    $profileType = 'Vataj Prakruti';
    $profileDescription = 'Vata individuals should follow a regular routine, consume warm and nourishing food, avoid excessive fasting and over-exercise, and practice calming yoga and meditation.';
    $healthTendencies = [
        'Joint pain and arthritis',
        'Constipation',
        'Insomnia',
        'Nervous system disorders'
    ];
} elseif ($pittaScore > 4) {
    $profileType = 'Pittaj Prakruti';
    $profileDescription = 'Pitta individuals benefit from cooling food, moderation in work, avoidance of excessive heat, and practices like pranayama, yoga, and meditation.';
    $healthTendencies = [
        'Acidity and ulcers',
        'Skin disorders',
        'Inflammatory conditions',
        'Hormonal imbalances'
    ];
} elseif ($kaphaScore > 4) {
    $profileType = 'Kaphaj Prakruti';
    $profileDescription = 'Kaphaj individuals should consume light and warm food, avoid day sleep, follow regular physical activity, and maintain an active lifestyle.';
    $healthTendencies = [
        'Obesity',
        'Diabetes',
        'Respiratory disorders',
        'Lethargy and depression'
    ];
} else {
    // Determine dominant or dual dosha constitution
    $maxScore = max($vataScore, $pittaScore, $kaphaScore);
    if ($vataScore === $maxScore && $pittaScore === $maxScore) {
        $profileType = 'Vata-Pitta Prakruti';
        $profileDescription = 'Your assessment shows a dual Vata-Pitta constitution. Balance warmth with moderation, nourish your nervous system, and maintain regular meal schedules while avoiding excess heat.';
        $healthTendencies = [
            'Joint sensitivity & acidity',
            'Irregular digestion & insomnia',
            'Skin sensitivity & inflammation',
            'Stress-induced fatigue'
        ];
    } elseif ($pittaScore === $maxScore && $kaphaScore === $maxScore) {
        $profileType = 'Pitta-Kapha Prakruti';
        $profileDescription = 'Your assessment indicates a balanced Pitta-Kapha constitution. Focus on light, cooling foods, regular physical exercise, and mindful stress relief to support metabolism.';
        $healthTendencies = [
            'Sluggish metabolism & acidity',
            'Hormonal imbalances',
            'Inflammatory skin conditions',
            'Weight management challenges'
        ];
    } elseif ($vataScore === $maxScore && $kaphaScore === $maxScore) {
        $profileType = 'Vata-Kapha Prakruti';
        $profileDescription = 'Your assessment indicates a dual Vata-Kapha constitution. Favor warm, light, and spiced meals, maintain active daily routines, and protect yourself against cold weather.';
        $healthTendencies = [
            'Cold sensitivity & joint stiffness',
            'Variable digestion & respiratory congestion',
            'Circulation sluggishness',
            'Seasonal lethargy'
        ];
    } elseif ($vataScore === $maxScore) {
        $profileType = 'Vataj Prakruti';
        $profileDescription = 'Vata individuals should follow a regular routine, consume warm and nourishing food, avoid excessive fasting and over-exercise, and practice calming yoga and meditation.';
        $healthTendencies = [
            'Joint pain and arthritis',
            'Constipation',
            'Insomnia',
            'Nervous system disorders'
        ];
    } elseif ($pittaScore === $maxScore) {
        $profileType = 'Pittaj Prakruti';
        $profileDescription = 'Pitta individuals benefit from cooling food, moderation in work, avoidance of excessive heat, and practices like pranayama, yoga, and meditation.';
        $healthTendencies = [
            'Acidity and ulcers',
            'Skin disorders',
            'Inflammatory conditions',
            'Hormonal imbalances'
        ];
    } else {
        $profileType = 'Kaphaj Prakruti';
        $profileDescription = 'Kaphaj individuals should consume light and warm food, avoid day sleep, follow regular physical activity, and maintain an active lifestyle.';
        $healthTendencies = [
            'Obesity',
            'Diabetes',
            'Respiratory disorders',
            'Lethargy and depression'
        ];
    }
}

// Show to all - Prakruti & Preventive Healthcare
$preventiveCare = [
    [
        'title' => '1. Early Risk Awareness',
        'description' => 'Prakruti assessment helps identify individual tendencies such as digestive problems, stress sensitivity, sleep disturbances, or seasonal imbalances before they become persistent concerns.'
    ],
    [
        'title' => '2. Personalized Prevention',
        'description' => 'Dosha-specific diet, daily routine, seasonal care, sleep, and exercise can help maintain digestion, energy, sleep quality, and overall balance.'
    ],
    [
        'title' => '3. Long-Term Health Protection',
        'description' => 'Living according to Prakruti may help reduce lifestyle-related imbalances, support immunity and healthy metabolism, and promote sustained physical and mental well-being.'
    ]
];

/**
 * Generate Next Unique Patient ID (OCA001, OCA002, OCA003...)
 */
$patientIdQuery = "
    SELECT patient_id
    FROM patients
    WHERE patient_id REGEXP '^OCA[0-9]+$'
    ORDER BY CAST(SUBSTRING(patient_id, 4) AS UNSIGNED) DESC
    LIMIT 1
";

$pidRes = mysqli_query($connection1, $patientIdQuery);

$nextNum = 1;

if ($pidRes && $pRow = mysqli_fetch_assoc($pidRes)) {
    if (preg_match('/^OCA(\d+)$/', $pRow['patient_id'], $m)) {
        $nextNum = (int)$m[1] + 1;
    }
}

$newPatientId = 'OCA' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);

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

// Additional Patient Schema Fields
$bloodGroup = isset($data['bloodGroup']) ? trim($data['bloodGroup']) : (isset($data['blood_group']) ? trim($data['blood_group']) : 'O+');
$emergencyContact = isset($data['emergencyContact']) ? trim($data['emergencyContact']) : (isset($data['emergency_contact']) ? trim($data['emergency_contact']) : '');
$address = isset($data['address']) ? trim($data['address']) : '';
$packageName = isset($data['packageName']) ? trim($data['packageName']) : (isset($data['package_name']) ? trim($data['package_name']) : '');
$referralCode = isset($data['referralCode']) ? strtoupper(trim((string)$data['referralCode'])) : (isset($data['referral_code']) ? strtoupper(trim((string)$data['referral_code'])) : null);
if ($referralCode === '') {
    $referralCode = null;
}
$status = 'Ongoing';

// Check if referral_code column exists in patients table
$hasPatRefCol = false;
$chkPatRef = @mysqli_query($connection1, "SHOW COLUMNS FROM patients LIKE 'referral_code'");
if ($chkPatRef && mysqli_num_rows($chkPatRef) > 0) {
    $hasPatRefCol = true;
}

// 2. Insert into `patients` table based on schema.sql
$patientRecordId = null;
$finalPatientId = $newPatientId;

if ($hasPatRefCol) {
    $insertPat = "INSERT INTO patients (
        patient_id, patient_profile, full_name, dob, age, height, weight, phone_number, gender, email, blood_group, emergency_contact, address, package_name, referral_code, total_appointments, status, created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW()
    )";
    $pInStmt = mysqli_prepare($connection1, $insertPat);
    if ($pInStmt) {
        mysqli_stmt_bind_param($pInStmt, "ssssisssssssssss", 
            $newPatientId, 
            $profileType, 
            $fullName, 
            $formattedDob, 
            $age, 
            $height, 
            $weight, 
            $phoneDigits, 
            $gender, 
            $email,
            $bloodGroup,
            $emergencyContact,
            $address,
            $packageName,
            $referralCode,
            $status
        );
        mysqli_stmt_execute($pInStmt);
        $patientRecordId = mysqli_insert_id($connection1);
        mysqli_stmt_close($pInStmt);
    }
} else {
    $insertPat = "INSERT INTO patients (
        patient_id, patient_profile, full_name, dob, age, height, weight, phone_number, gender, email, blood_group, emergency_contact, address, package_name, total_appointments, status, created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW()
    )";
    $pInStmt = mysqli_prepare($connection1, $insertPat);
    if ($pInStmt) {
        mysqli_stmt_bind_param($pInStmt, "ssssissssssssss", 
            $newPatientId, 
            $profileType, 
            $fullName, 
            $formattedDob, 
            $age, 
            $height, 
            $weight, 
            $phoneDigits, 
            $gender, 
            $email,
            $bloodGroup,
            $emergencyContact,
            $address,
            $packageName,
            $status
        );
        mysqli_stmt_execute($pInStmt);
        $patientRecordId = mysqli_insert_id($connection1);
        mysqli_stmt_close($pInStmt);
    }
}

// Fallback in case of schema discrepancy
if (!$patientRecordId) {
    if ($hasPatRefCol) {
        $fallbackInsert = "INSERT INTO patients (patient_id, full_name, dob, age, phone_number, gender, email, package_name, referral_code, total_appointments, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())";
        if ($fbStmt = mysqli_prepare($connection1, $fallbackInsert)) {
            mysqli_stmt_bind_param($fbStmt, "sssissssss", $newPatientId, $fullName, $formattedDob, $age, $phoneDigits, $gender, $email, $packageName, $referralCode, $status);
            mysqli_stmt_execute($fbStmt);
            $patientRecordId = mysqli_insert_id($connection1);
            mysqli_stmt_close($fbStmt);
        }
    } else {
        $fallbackInsert = "INSERT INTO patients (patient_id, full_name, dob, age, phone_number, gender, email, package_name, total_appointments, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW())";
        if ($fbStmt = mysqli_prepare($connection1, $fallbackInsert)) {
            mysqli_stmt_bind_param($fbStmt, "sssisssss", $newPatientId, $fullName, $formattedDob, $age, $phoneDigits, $gender, $email, $packageName, $status);
            mysqli_stmt_execute($fbStmt);
            $patientRecordId = mysqli_insert_id($connection1);
            mysqli_stmt_close($fbStmt);
        }
    }
}

// Fetch complete newly-created record from database
$patientPayload = null;
if ($patientRecordId) {
    $selPat = "SELECT * FROM patients WHERE id = ? LIMIT 1";
    if ($spStmt = mysqli_prepare($connection1, $selPat)) {
        mysqli_stmt_bind_param($spStmt, "i", $patientRecordId);
        mysqli_stmt_execute($spStmt);
        $spRes = mysqli_stmt_get_result($spStmt);
        $patientPayload = mysqli_fetch_assoc($spRes);
        mysqli_stmt_close($spStmt);
    }
}
if (!$patientPayload) {
    $patientPayload = [
        'id' => (int)$patientRecordId,
        'patient_id' => $finalPatientId,
        'patient_profile' => $profileType,
        'full_name' => $fullName,
        'dob' => $formattedDob,
        'age' => $age,
        'height' => $height,
        'weight' => $weight,
        'gender' => $gender,
        'phone_number' => $phoneDigits,
        'email' => $email,
        'blood_group' => $bloodGroup,
        'emergency_contact' => $emergencyContact,
        'address' => $address,
        'package_name' => $packageName,
        'total_appointments' => 0,
        'status' => $status,
        'created_at' => date('Y-m-d H:i:s'),
        'updated_at' => date('Y-m-d H:i:s')
    ];
}
$patientPayload['dob_formatted'] = !empty($patientPayload['dob']) ? date('d/m/Y', strtotime($patientPayload['dob'])) : '';

// 3. Set Session Variables
$_SESSION['user_id'] = $userId;
$_SESSION['username'] = $username;
$_SESSION['full_name'] = $fullName;
$_SESSION['phone_number'] = $phoneDigits;
$_SESSION['email'] = $email;
$_SESSION['role'] = 'Patient';
$_SESSION['patient_id'] = $finalPatientId;

// Send Success Response
sendJsonResponse(true, 'Account created successfully! Welcome to Ocayur.', [
    'user' => [
        'id' => (int)$userId,
        'username' => $username,
        'full_name' => $fullName,
        'email' => $email,
        'phone_number' => $phoneDigits,
        'role' => 'Patient'
    ],
    'patient' => $patientPayload,
    'prakruti_result' => [
        'type' => $profileType,
        'title' => $profileType,
        'description' => $profileDescription,
        'health_tendencies' => $healthTendencies,
        'preventive_care' => $preventiveCare,
        'vata_score' => $vataScore,
        'pitta_score' => $pittaScore,
        'kapha_score' => $kaphaScore,
        'total_questions' => 8
    ]
], 201);
