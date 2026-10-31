<?php
/**
 * Ocayur Patient Portal - Create Account API
 * Handles 3-step registration flow:
 * 1. Personal Details (Full Name, DOB, Gender, Height, Weight)
 * 2. Prakruti Parikshan (Appetite, Sleep Type, Dream, Skin Type, Hair Type)
 * 3. Security Credentials (Password)
 * Creates records in `users` and `patients` tables according to schema.sql.
 */

// Enable strict reporting so mysqli errors throw mysqli_sql_exception
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

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

// Helper function to return standardized JSON response
function sendJsonResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success'   => $success,
        'message'   => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data), JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    require_once __DIR__ . '/database.php';
    require_once __DIR__ . '/activity_logger.php';

    if (!isset($connection1) || !$connection1 || (is_object($connection1) && mysqli_connect_errno())) {
        sendJsonResponse(false, 'Database Connection Failed: ' . (mysqli_connect_error() ?: 'Unable to connect to database.'), [], 200);
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
            $uCheck = mysqli_prepare($connection1, "SELECT id FROM users WHERE phone_number = ? OR username = ? LIMIT 1");
            if ($uCheck) {
                mysqli_stmt_bind_param($uCheck, "ss", $phoneDigits, $phoneDigits);
                mysqli_stmt_execute($uCheck);
                $uRes = mysqli_stmt_get_result($uCheck);
                $uFound = mysqli_fetch_assoc($uRes);
                mysqli_stmt_close($uCheck);

                if ($uFound) {
                    sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['exists' => true], 200);
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
                    sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['exists' => true], 200);
                }
            }

            sendJsonResponse(true, 'Phone number is available.', ['exists' => false], 200);
        }
        sendJsonResponse(true, 'Phone number required.', ['exists' => false], 200);
    }

    // Email availability check endpoint
    if (isset($_GET['check_email']) || (isset($data['action']) && $data['action'] === 'check_email')) {
        $checkEmail = isset($_GET['check_email']) ? trim($_GET['check_email']) : (isset($data['email']) ? trim($data['email']) : '');
        if (!empty($checkEmail)) {
            $eCheck = mysqli_prepare($connection1, "SELECT id FROM users WHERE email = ? LIMIT 1");
            if ($eCheck) {
                mysqli_stmt_bind_param($eCheck, "s", $checkEmail);
                mysqli_stmt_execute($eCheck);
                $eRes = mysqli_stmt_get_result($eCheck);
                $eFound = mysqli_fetch_assoc($eRes);
                mysqli_stmt_close($eCheck);

                if ($eFound) {
                    sendJsonResponse(false, 'This email address is already registered. Please log in or use a different email.', ['exists' => true], 200);
                }
            }
            sendJsonResponse(true, 'Email address is available.', ['exists' => false], 200);
        }
        sendJsonResponse(true, 'Email address required.', ['exists' => false], 200);
    }

    // Step 1: Personal Details
    $fullName  = isset($data['fullName']) ? trim($data['fullName']) : (isset($data['full_name']) ? trim($data['full_name']) : '');
    $dobRaw    = isset($data['dob']) ? trim($data['dob']) : '';
    $genderRaw = isset($data['gender']) ? strtolower(trim($data['gender'])) : 'male';
    $height    = isset($data['height']) ? trim($data['height']) : '';
    $weight    = isset($data['weight']) ? trim($data['weight']) : '';
    $phone     = isset($data['phone']) ? trim($data['phone']) : (isset($data['phoneNumber']) ? trim($data['phoneNumber']) : (isset($data['phone_number']) ? trim($data['phone_number']) : ''));
    $email     = isset($data['email']) ? trim($data['email']) : '';

    // Step 2: Prakruti Parikshan
    $appetite         = isset($data['appetite']) ? trim($data['appetite']) : 'irregular';
    $sleepType        = isset($data['sleepType']) ? trim($data['sleepType']) : 'moderate';
    $skinType         = isset($data['skinType']) ? trim($data['skinType']) : 'warm_sensitive';
    $hairType         = isset($data['hairType']) ? trim($data['hairType']) : 'fine_soft';
    $bowelMovement    = isset($data['bowelMovement']) ? trim($data['bowelMovement']) : (isset($data['bowel_movement']) ? trim($data['bowel_movement']) : 'regular_frequent');
    $stressResponse   = isset($data['stressResponse']) ? trim($data['stressResponse']) : (isset($data['stress_response']) ? trim($data['stress_response']) : 'irritability_anger');
    $bodyTemperature  = isset($data['bodyTemperature']) ? trim($data['bodyTemperature']) : (isset($data['body_temperature']) ? trim($data['body_temperature']) : 'feels_hot');
    $physicalActivity = isset($data['physicalActivity']) ? trim($data['physicalActivity']) : (isset($data['physical_activity']) ? trim($data['physical_activity']) : 'active_intense');
    $dream1           = isset($data['dream1']) ? trim($data['dream1']) : 'water';

    // Step 3: Security Credentials
    $password        = isset($data['password']) ? $data['password'] : (isset($data['newPassword']) ? $data['newPassword'] : '');
    $confirmPassword = isset($data['confirmPassword']) ? $data['confirmPassword'] : (isset($data['confirm_password']) ? $data['confirm_password'] : '');

    // Terms validation
    if (isset($data['termsAccepted']) && ($data['termsAccepted'] === false || $data['termsAccepted'] === 'false')) {
        sendJsonResponse(false, 'Please accept the Terms & Conditions and Privacy Policy to create your account.', [], 400);
    }

    // Basic validations
    if (empty($fullName)) {
        sendJsonResponse(false, 'Please enter your full name.', [], 400);
    }

    // Phone number validation and normalization
    $phoneDigits = preg_replace('/[^\d]/', '', $phone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    if (empty($phoneDigits) || strlen($phoneDigits) < 10) {
        sendJsonResponse(false, 'Please enter a valid 10-digit phone number.', [], 400);
    }

    // Generate fallback email if empty
    if (empty($email)) {
        $cleanName = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $fullName));
        $email = $cleanName . substr($phoneDigits, -4) . '@panchved.com';
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

    // Gender normalization (matches enum('Male','Female','Other'))
    $gender = 'Male';
    if ($genderRaw === 'female') {
        $gender = 'Female';
    } elseif ($genderRaw === 'other') {
        $gender = 'Other';
    }

    // Date of Birth & Age Calculation
    $formattedDob = null;
    $age = 30; // default age

    if (!empty($dobRaw)) {
        $parsedYear = null;
        $parsedMonth = null;
        $parsedDay = null;

        if (preg_match('/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/', trim($dobRaw), $matches)) {
            $p1 = (int)$matches[1];
            $p2 = (int)$matches[2];
            $rawYear = $matches[3];
            if (strlen($rawYear) === 2) {
                $currentYearShort = (int)date('y');
                $parsedYear = ((int)$rawYear > $currentYearShort) ? ('19' . $rawYear) : ('20' . $rawYear);
            } else {
                $parsedYear = $rawYear;
            }

            // Distinguish DD/MM vs MM/DD
            if ($p1 > 12 && $p2 <= 12) {
                $parsedDay = str_pad((string)$p1, 2, '0', STR_PAD_LEFT);
                $parsedMonth = str_pad((string)$p2, 2, '0', STR_PAD_LEFT);
            } elseif ($p1 <= 12 && $p2 > 12) {
                $parsedMonth = str_pad((string)$p1, 2, '0', STR_PAD_LEFT);
                $parsedDay = str_pad((string)$p2, 2, '0', STR_PAD_LEFT);
            } else {
                // Default to standard DD/MM/YYYY
                $parsedDay = str_pad((string)$p1, 2, '0', STR_PAD_LEFT);
                $parsedMonth = str_pad((string)$p2, 2, '0', STR_PAD_LEFT);
            }
        } elseif (preg_match('/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/', trim($dobRaw), $matches)) {
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
    }

    // Explicit age parameter takes precedence if age calculation was skipped or age is zero
    if (isset($data['age']) && is_numeric($data['age'])) {
        $explicitAge = (int)$data['age'];
        if ($explicitAge > 0 && ($age === 0 || empty($formattedDob) || abs($age - $explicitAge) <= 1)) {
            $age = $explicitAge;
        }
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

    // Rule: Any Dosha having more than 4 ticks falls under that category
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

    // Password Bcrypt Hash
    $passwordHash = password_hash($password, PASSWORD_BCRYPT);

    // 1. Verify Phone Number does not exist in `users`
    $checkPhoneUser = "SELECT id, username FROM users WHERE phone_number = ? OR username = ? LIMIT 1";
    $uCheckStmt = mysqli_prepare($connection1, $checkPhoneUser);
    mysqli_stmt_bind_param($uCheckStmt, "ss", $phoneDigits, $phoneDigits);
    mysqli_stmt_execute($uCheckStmt);
    $uCheckRes = mysqli_stmt_get_result($uCheckStmt);
    $existingPhoneUser = mysqli_fetch_assoc($uCheckRes);
    mysqli_stmt_close($uCheckStmt);

    if ($existingPhoneUser) {
        sendJsonResponse(false, 'This phone number is already registered. Please log in or use a different number.', ['phone_exists' => true], 409);
    }

    // 2. Verify Phone Number does not exist in `patients`
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

    // 3. Verify Email does not exist in `users` (which has UNIQUE KEY idx_user_email)
    $checkEmailUser = "SELECT id FROM users WHERE email = ? LIMIT 1";
    $eCheckStmt = mysqli_prepare($connection1, $checkEmailUser);
    mysqli_stmt_bind_param($eCheckStmt, "s", $email);
    mysqli_stmt_execute($eCheckStmt);
    $eCheckRes = mysqli_stmt_get_result($eCheckStmt);
    $existingEmailUser = mysqli_fetch_assoc($eCheckRes);
    mysqli_stmt_close($eCheckStmt);

    if ($existingEmailUser) {
        sendJsonResponse(false, 'This email address is already registered. Please log in or use a different email.', ['email_exists' => true], 409);
    }

    /**
     * Generate Next Unique Patient ID (OCA001, OCA002, OCA003...)
     * With loop verification to guarantee NO primary or unique key collision on idx_patient_id
     */
    $nextNum = 1;
    $patientIdQuery = "
        SELECT patient_id
        FROM patients
        WHERE patient_id REGEXP '^OCA[0-9]+$'
        ORDER BY CAST(SUBSTRING(patient_id, 4) AS UNSIGNED) DESC
        LIMIT 1
    ";
    $pidRes = mysqli_query($connection1, $patientIdQuery);
    if ($pidRes && $pRow = mysqli_fetch_assoc($pidRes)) {
        if (preg_match('/^OCA(\d+)$/', $pRow['patient_id'], $m)) {
            $nextNum = (int)$m[1] + 1;
        }
    }

    // Safety loop to find next truly available patient_id
    $newPatientId = 'OCA' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
    $safetyLoop = 0;
    while ($safetyLoop < 1000) {
        $candidateId = 'OCA' . str_pad($nextNum, 3, '0', STR_PAD_LEFT);
        $chkPidStmt = mysqli_prepare($connection1, "SELECT id FROM patients WHERE patient_id = ? LIMIT 1");
        if ($chkPidStmt) {
            mysqli_stmt_bind_param($chkPidStmt, "s", $candidateId);
            mysqli_stmt_execute($chkPidStmt);
            $chkPidRes = mysqli_stmt_get_result($chkPidStmt);
            $taken = mysqli_fetch_assoc($chkPidRes);
            mysqli_stmt_close($chkPidStmt);
            if (!$taken) {
                $newPatientId = $candidateId;
                break;
            }
        }
        $nextNum++;
        $safetyLoop++;
    }

    // Additional Patient Schema Fields & Normalization
    $bloodGroup = isset($data['bloodGroup']) ? trim($data['bloodGroup']) : (isset($data['blood_group']) ? trim($data['blood_group']) : 'O+');
    $bloodGroup = !empty($bloodGroup) ? $bloodGroup : 'O+';

    $emergencyContact = isset($data['emergencyContact']) ? trim($data['emergencyContact']) : (isset($data['emergency_contact']) ? trim($data['emergency_contact']) : null);
    $emergencyContact = !empty($emergencyContact) ? $emergencyContact : null;

    $address = isset($data['address']) ? trim($data['address']) : null;
    $address = !empty($address) ? $address : null;

    $packageName = isset($data['packageName']) ? trim($data['packageName']) : (isset($data['package_name']) ? trim($data['package_name']) : 'Stress Management');
    $packageName = !empty($packageName) ? $packageName : 'Stress Management';

    $referralCode = isset($data['referralCode']) ? strtoupper(trim((string)$data['referralCode'])) : (isset($data['referral_code']) ? strtoupper(trim((string)$data['referral_code'])) : null);
    if ($referralCode === '') {
        $referralCode = null;
    }

    $heightValue = !empty($height) ? $height : null;
    $weightValue = !empty($weight) ? $weight : null;
    $status = 'Ongoing';

    // Check if referral_code column exists in patients table
    $hasPatRefCol = false;
    $chkPatRef = @mysqli_query($connection1, "SHOW COLUMNS FROM patients LIKE 'referral_code'");
    if ($chkPatRef && mysqli_num_rows($chkPatRef) > 0) {
        $hasPatRefCol = true;
    }

    // Begin Database Transaction to ensure atomicity across `users` and `patients`
    mysqli_begin_transaction($connection1);

    // 1. Insert into `users` table
    $userId = null;
    $insertUser = "INSERT INTO users (username, full_name, email, phone_number, password_hash, role, status, last_login) VALUES (?, ?, ?, ?, ?, 'Patient', 'Active', NOW())";
    $uInStmt = mysqli_prepare($connection1, $insertUser);
    if (!$uInStmt) {
        throw new mysqli_sql_exception('Failed to prepare user insertion: ' . mysqli_error($connection1));
    }
    mysqli_stmt_bind_param($uInStmt, "sssss", $username, $fullName, $email, $phoneDigits, $passwordHash);
    mysqli_stmt_execute($uInStmt);
    $userId = mysqli_insert_id($connection1);
    mysqli_stmt_close($uInStmt);

    if (!$userId) {
        throw new mysqli_sql_exception('Failed to generate user record ID.');
    }

    // 2. Insert into `patients` table
    $patientRecordId = null;

    if ($hasPatRefCol) {
        $insertPat = "INSERT INTO patients (
            patient_id, patient_profile, full_name, dob, age, height, weight, phone_number, gender, email, blood_group, emergency_contact, address, package_name, referral_code, total_appointments, status, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW()
        )";
        $pInStmt = mysqli_prepare($connection1, $insertPat);
        if (!$pInStmt) {
            throw new mysqli_sql_exception('Failed to prepare patient insertion: ' . mysqli_error($connection1));
        }
        mysqli_stmt_bind_param($pInStmt, "ssssisssssssssss", 
            $newPatientId, 
            $profileType, 
            $fullName, 
            $formattedDob, 
            $age, 
            $heightValue, 
            $weightValue, 
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
    } else {
        $insertPat = "INSERT INTO patients (
            patient_id, patient_profile, full_name, dob, age, height, weight, phone_number, gender, email, blood_group, emergency_contact, address, package_name, total_appointments, status, created_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NOW(), NOW()
        )";
        $pInStmt = mysqli_prepare($connection1, $insertPat);
        if (!$pInStmt) {
            throw new mysqli_sql_exception('Failed to prepare patient insertion: ' . mysqli_error($connection1));
        }
        mysqli_stmt_bind_param($pInStmt, "ssssissssssssss", 
            $newPatientId, 
            $profileType, 
            $fullName, 
            $formattedDob, 
            $age, 
            $heightValue, 
            $weightValue, 
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

    if (!$patientRecordId) {
        throw new mysqli_sql_exception('Failed to create patient profile record.');
    }

    // Commit Transaction
    mysqli_commit($connection1);

    // Fetch newly-created record from database
    $patientPayload = null;
    $selPat = "SELECT * FROM patients WHERE id = ? LIMIT 1";
    if ($spStmt = mysqli_prepare($connection1, $selPat)) {
        mysqli_stmt_bind_param($spStmt, "i", $patientRecordId);
        mysqli_stmt_execute($spStmt);
        $spRes = mysqli_stmt_get_result($spStmt);
        $patientPayload = mysqli_fetch_assoc($spRes);
        mysqli_stmt_close($spStmt);
    }

    if (!$patientPayload) {
        $patientPayload = [
            'id' => (int)$patientRecordId,
            'patient_id' => $newPatientId,
            'patient_profile' => $profileType,
            'full_name' => $fullName,
            'dob' => $formattedDob,
            'age' => $age,
            'height' => $heightValue,
            'weight' => $weightValue,
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

    // Set Session Variables
    $_SESSION['user_id'] = $userId;
    $_SESSION['username'] = $username;
    $_SESSION['full_name'] = $fullName;
    $_SESSION['phone_number'] = $phoneDigits;
    $_SESSION['email'] = $email;
    $_SESSION['role'] = 'Patient';
    $_SESSION['patient_id'] = $newPatientId;

    // Audit log (non-blocking)
    try {
        recordActivity($connection1, [
            'actor_type'   => 'Patient',
            'actor_id'     => (int)$userId,
            'actor_name'   => $fullName,
            'actor_phone'  => $phoneDigits,
            'actor_email'  => $email,
            'module'       => 'Patient',
            'action'       => 'patient.registered',
            'entity_type'  => 'Patient',
            'entity_id'    => (string)$patientRecordId,
            'entity_name'  => $fullName,
            'description'  => "Patient {$fullName} ({$newPatientId}) registered an account",
            'new_values'   => [
                'patient_id'    => $newPatientId,
                'user_id'       => (int)$userId,
                'phone_number'  => $phoneDigits,
                'email'         => $email,
                'gender'        => $gender,
                'age'           => $age,
                'profile_type'  => $profileType,
                'referral_code' => $referralCode
            ]
        ]);
    } catch (Throwable $e) {
        // Logging error shouldn't fail registration
    }

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

} catch (mysqli_sql_exception $e) {
    if (isset($connection1) && $connection1 instanceof mysqli) {
        @mysqli_rollback($connection1);
    }
    // Return HTTP 200 with success: false to prevent Azure / IIS from converting errors to a 404 page
    sendJsonResponse(false, 'Database Error: ' . $e->getMessage(), [
        'error_detail' => $e->getMessage(),
        'error_code'   => $e->getCode(),
        'sqlstate'     => $e->getSqlState() ?? ''
    ], 200);

} catch (Throwable $e) {
    if (isset($connection1) && $connection1 instanceof mysqli) {
        @mysqli_rollback($connection1);
    }
    // Return HTTP 200 with success: false to prevent Azure / IIS from converting errors to a 404 page
    sendJsonResponse(false, 'System Error: ' . $e->getMessage(), [
        'error_detail' => $e->getMessage(),
        'file'         => basename($e->getFile()),
        'line'         => $e->getLine()
    ], 200);
}
