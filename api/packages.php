<?php
/**
 * Panchved Patient Portal - Packages Backend API
 * Handles:
 * 1. GET (action: list / default) - Fetch all active packages from `packages` table
 * 2. GET (action: details) - Fetch single package details + linked doctor info
 * 3. GET (action: my_package) - Fetch active enrolled package for authenticated patient
 * 4. POST (action: enroll / book_package / book_consultation) - Enroll patient into package,
 *    increment package enrollment count, create scheduled appointment in `appointments` table
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

// Helper function to sanitize package name and remove any trailing/embedded '- Consultation'
function cleanPackageName($name) {
    if (empty($name) || !is_string($name)) return '';
    $cleaned = preg_replace('/\s*-\s*consultation\s*$/i', '', $name);
    $cleaned = preg_replace('/\s*consultation\s*$/i', '', $cleaned);
    $cleaned = preg_replace('/\s*-\s*consultation\b/i', '', $cleaned);
    return trim($cleaned);
}

// Dynamic Doctor Resolution helper using MySQL `doctors` table schema
function resolveDoctorForPackage($connection1, $assignedDoctorName = '', $packageName = '', $category = '') {
    $assignedDoctorName = trim((string)$assignedDoctorName);
    $docRow = null;

    if (!empty($assignedDoctorName)) {
        // 1. Exact match by full_name
        $stmt = mysqli_prepare($connection1, "SELECT * FROM doctors WHERE full_name = ? LIMIT 1");
        if ($stmt) {
            mysqli_stmt_bind_param($stmt, "s", $assignedDoctorName);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $docRow = mysqli_fetch_assoc($res);
            mysqli_stmt_close($stmt);
        }

        // 2. Fuzzy match or ID match if not found
        if (!$docRow) {
            $stmt = mysqli_prepare($connection1, "SELECT * FROM doctors WHERE full_name LIKE ? OR doctorid = ? OR id = ? LIMIT 1");
            if ($stmt) {
                $like = '%' . $assignedDoctorName . '%';
                $idVal = is_numeric($assignedDoctorName) ? (int)$assignedDoctorName : 0;
                mysqli_stmt_bind_param($stmt, "ssi", $like, $assignedDoctorName, $idVal);
                mysqli_stmt_execute($stmt);
                $res = mysqli_stmt_get_result($stmt);
                $docRow = mysqli_fetch_assoc($res);
                mysqli_stmt_close($stmt);
            }
        }
    }

    // 3. Fallback: match by active doctor or first active doctor in table
    if (!$docRow) {
        $res = mysqli_query($connection1, "SELECT * FROM doctors WHERE status = 'Active' ORDER BY id ASC LIMIT 1");
        if ($res) {
            $docRow = mysqli_fetch_assoc($res);
        }
    }

    if ($docRow) {
        $docName = trim((string)$docRow['full_name']);
        $expertise = trim((string)($docRow['expertise'] ?? 'Ayurveda Physician'));
        $area = trim((string)($docRow['area'] ?? ''));
        $exp = (int)($docRow['years_of_experience'] ?? 0);

        // Role formatted
        $role = !empty($expertise) ? $expertise : 'Ayurveda Physician';
        if (!empty($area) && strlen($area) > 2) {
            $role .= " ({$area})";
        }

        // Initials calculation from doctor name
        $cleanedDocName = preg_replace('/^(Dr\.|Dr)\s*/i', '', $docName);
        $words = preg_split('/\s+/', trim($cleanedDocName));
        $initials = '';
        foreach ($words as $w) {
            if (!empty($w)) $initials .= strtoupper($w[0]);
        }
        $initials = substr($initials, 0, 2) ?: 'DR';

        // Professional schema-driven doctor description
        if ($exp > 0 && !empty($area) && strlen($area) > 2) {
            $docDescription = "{$docName} is a senior {$expertise} with over {$exp} years of clinical expertise specializing in {$area}. Dedicated to holistic patient-centric healing, authentic Ayurvedic protocols, and preventive wellness care.";
        } elseif ($exp > 0) {
            $docDescription = "{$docName} is an experienced {$expertise} with over {$exp} years of clinical practice, committed to restorative care, personalized treatment protocols, and holistic wellness.";
        } elseif (!empty($area) && strlen($area) > 2) {
            $docDescription = "{$docName} is a dedicated {$expertise} specializing in {$area}, providing evidence-based Ayurvedic therapies and comprehensive patient rehabilitation.";
        } else {
            $docDescription = "{$docName} is a dedicated {$expertise} committed to patient-centric holistic healing and preventive lifestyle care.";
        }

        return [
            'id' => (int)$docRow['id'],
            'doctorid' => $docRow['doctorid'] ?? '',
            'name' => $docName,
            'role' => $role,
            'expertise' => $expertise,
            'area' => $area,
            'experience' => $exp,
            'initials' => $initials,
            'description' => $docDescription,
            'email' => $docRow['email'] ?? '',
            'phone' => $docRow['phone_number'] ?? '',
            'registration_number' => $docRow['registration_number'] ?? ''
        ];
    }

    // Default fallback if doctors table is empty
    return [
        'id' => 1,
        'doctorid' => 'DOC000001',
        'name' => !empty($assignedDoctorName) ? $assignedDoctorName : 'Dr. Nidhi Jha',
        'role' => 'Ayurveda Physician',
        'expertise' => 'Ayurveda Physician',
        'area' => 'Pediatrics & Gynecology',
        'experience' => 12,
        'initials' => 'NJ',
        'description' => 'Dedicated senior Ayurvedic physician committed to patient-centric holistic healing and preventive lifestyle care.'
    ];
}

// Format a single package record into complete dynamic data structure
function formatPackageRecord($row, $connection1) {
    // Dynamic About the Package Overview
    $overview = '';
    if (isset($row['overview']) && trim((string)$row['overview']) !== '') {
        $overview = trim((string)$row['overview']);
    } elseif (isset($row['short_description']) && trim((string)$row['short_description']) !== '') {
        $overview = trim((string)$row['short_description']);
    } else {
        $overview = 'A personalized, multi-dimensional Ayurvedic and rehabilitation wellness protocol tailored to your dosha.';
    }

    // Dynamic Short Description / Subtitle
    $shortDesc = '';
    if (isset($row['short_description']) && trim((string)$row['short_description']) !== '') {
        $shortDesc = trim((string)$row['short_description']);
    } elseif (isset($row['overview']) && trim((string)$row['overview']) !== '') {
        $shortDesc = trim((string)$row['overview']);
    } else {
        $shortDesc = 'Comprehensive multi-disciplinary care program tailored to balance doshas and restore vitality.';
    }

    $assignedDoctor = $row['assigned_doctor'] ?? '';
    $doctor = resolveDoctorForPackage($connection1, $assignedDoctor, $row['package_name'] ?? '', $row['category'] ?? '');

    $img = !empty($row['image_url']) && $row['image_url'] !== 'assets/package-thumb.jpg' ? $row['image_url'] : 'assets/gut-healing-pkg.jpg';

    $priceVal = isset($row['price']) ? (float)$row['price'] : 7999.0;
    $enrollments = isset($row['enrollments']) ? (int)$row['enrollments'] : 0;

    return [
        'id' => (int)($row['id'] ?? 0),
        'package_id' => $row['package_id'] ?? ('PKG-' . str_pad($row['id'] ?? '1', 3, '0', STR_PAD_LEFT)),
        'package_name' => cleanPackageName($row['package_name'] ?? ''),
        'category' => $row['category'] ?? '',
        'assigned_doctor' => $assignedDoctor,
        'duration' => !empty($row['duration']) ? $row['duration'] : '3 Months',
        'price' => $priceVal,
        'price_formatted' => '₹' . number_format($priceVal, 0),
        'enrollments' => $enrollments,
        'batch_text' => $enrollments . ' Patient Batch',
        'short_description' => $shortDesc,
        'overview' => $overview,
        'benefits' => $row['benefits'] ?? '',
        'included' => $row['included'] ?? '',
        'diet_hydration' => $row['diet_hydration'] ?? '',
        'yoga_physio' => $row['yoga_physio'] ?? '',
        'ayurveda_dinacharya' => $row['ayurveda_dinacharya'] ?? '',
        'daily_activity' => $row['daily_activity'] ?? '',
        'patient_monitoring' => $row['patient_monitoring'] ?? '',
        'followup_review' => $row['followup_review'] ?? '',
        'image_url' => $img,
        'status' => $row['status'] ?? 'Active',
        'doctor' => $doctor
    ];
}

// --------------------------------------------------------------------------
// 1. GET REQUESTS
// --------------------------------------------------------------------------
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = isset($_GET['action']) ? trim($_GET['action']) : 'list';

    // ACTION: SINGLE PACKAGE DETAILS
    if ($action === 'details' || isset($_GET['id']) || isset($_GET['package_id']) || isset($_GET['name'])) {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        $pkgId = isset($_GET['package_id']) ? trim($_GET['package_id']) : '';
        $rawName = isset($_GET['name']) ? trim($_GET['name']) : '';
        $name = cleanPackageName($rawName);

        $pkg = null;
        if ($id > 0) {
            $stmt = mysqli_prepare($connection1, "SELECT * FROM packages WHERE id = ? LIMIT 1");
            mysqli_stmt_bind_param($stmt, "i", $id);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $pkg = mysqli_fetch_assoc($res);
            mysqli_stmt_close($stmt);
        } elseif (!empty($pkgId)) {
            $stmt = mysqli_prepare($connection1, "SELECT * FROM packages WHERE package_id = ? LIMIT 1");
            mysqli_stmt_bind_param($stmt, "s", $pkgId);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $pkg = mysqli_fetch_assoc($res);
            mysqli_stmt_close($stmt);
        } elseif (!empty($name) || !empty($rawName)) {
            $stmt = mysqli_prepare($connection1, "SELECT * FROM packages WHERE package_name = ? OR package_name LIKE ? OR ? LIKE CONCAT('%', package_name, '%') LIMIT 1");
            $nameLike = '%' . $name . '%';
            mysqli_stmt_bind_param($stmt, "sss", $name, $nameLike, $rawName);
            mysqli_stmt_execute($stmt);
            $res = mysqli_stmt_get_result($stmt);
            $pkg = mysqli_fetch_assoc($res);
            mysqli_stmt_close($stmt);
        } else {
            $res = mysqli_query($connection1, "SELECT * FROM packages WHERE status = 'Active' ORDER BY id ASC LIMIT 1");
            if ($res) {
                $pkg = mysqli_fetch_assoc($res);
            }
        }

        if (!$pkg) {
            sendJsonResponse(false, 'Package not found in database.', [], 404);
        }

        $formattedPackage = formatPackageRecord($pkg, $connection1);

        sendJsonResponse(true, 'Package details fetched successfully from database.', [
            'package' => $formattedPackage,
            'doctor' => $formattedPackage['doctor']
        ]);
    }

    // ACTION: FETCH ALL ACTIVE PACKAGES (LIST)
    if ($action === 'list') {
        $query = "SELECT * FROM packages WHERE status = 'Active' ORDER BY id ASC";
        $result = mysqli_query($connection1, $query);
        $packages = [];

        if ($result) {
            while ($row = mysqli_fetch_assoc($result)) {
                $packages[] = formatPackageRecord($row, $connection1);
            }
        }

        sendJsonResponse(true, 'Packages list loaded successfully from database.', [
            'count' => count($packages),
            'packages' => $packages
        ]);
    }

    // ACTION: MY ENROLLED PACKAGE
    if ($action === 'my_package') {
        $phone = isset($_GET['phone']) ? trim($_GET['phone']) : ($_SESSION['phone_number'] ?? '');
        $patientId = isset($_GET['patient_id']) ? trim($_GET['patient_id']) : ($_SESSION['patient_id'] ?? '');

        $patient = null;
        if (!empty($phone) || !empty($patientId)) {
            $pQuery = "SELECT id, patient_id, full_name, email, phone_number, package_name, total_appointments, status FROM patients WHERE (phone_number != '' AND phone_number = ?) OR (patient_id != '' AND patient_id = ?) LIMIT 1";
            if ($stmt = mysqli_prepare($connection1, $pQuery)) {
                mysqli_stmt_bind_param($stmt, "ss", $phone, $patientId);
                mysqli_stmt_execute($stmt);
                $pRes = mysqli_stmt_get_result($stmt);
                $patient = mysqli_fetch_assoc($pRes);
                mysqli_stmt_close($stmt);
            }
        }

        $packageName = cleanPackageName($patient['package_name'] ?? 'Gut Healing Package');

        // Query matching package info
        $pkgQuery = "SELECT * FROM packages WHERE package_name = ? OR package_name LIKE ? OR ? LIKE CONCAT('%', package_name, '%') LIMIT 1";
        $pStmt = mysqli_prepare($connection1, $pkgQuery);
        $pkgLike = '%' . $packageName . '%';
        mysqli_stmt_bind_param($pStmt, "sss", $packageName, $pkgLike, $packageName);
        mysqli_stmt_execute($pStmt);
        $pkgRes = mysqli_stmt_get_result($pStmt);
        $pkgData = mysqli_fetch_assoc($pkgRes);
        mysqli_stmt_close($pStmt);

        $formattedPkg = $pkgData ? formatPackageRecord($pkgData, $connection1) : null;

        sendJsonResponse(true, 'Patient enrolled package retrieved successfully.', [
            'patient' => $patient,
            'package_name' => $packageName,
            'package' => $formattedPkg
        ]);
    }
}

// --------------------------------------------------------------------------
// 2. POST REQUESTS: Enroll in Package & Book Appointment (Checkout Completion)
// --------------------------------------------------------------------------
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
if (!$data || !is_array($data)) {
    $data = $_POST;
}

$action = isset($data['action']) ? trim($data['action']) : 'enroll';

if ($action === 'enroll' || $action === 'book_package' || $action === 'book_consultation' || $_SERVER['REQUEST_METHOD'] === 'POST') {
    $rawPackageName = isset($data['package_name']) ? trim($data['package_name']) : (isset($data['packageTitle']) ? trim($data['packageTitle']) : 'Gut Healing Package');
    $packageName = cleanPackageName($rawPackageName);
    if (empty($packageName)) $packageName = 'Gut Healing Package';
    $patientName = isset($data['patient_name']) ? trim($data['patient_name']) : (isset($data['patientName']) ? trim($data['patientName']) : 'Rahul Sharma');
    $patientEmail = isset($data['patient_email']) ? trim($data['patient_email']) : (isset($data['patientEmail']) ? trim($data['patientEmail']) : 'rahulsharma@gmail.com');
    $patientPhone = isset($data['patient_phone']) ? trim($data['patient_phone']) : (isset($data['patientPhone']) ? trim($data['patientPhone']) : (isset($data['phone_number']) ? trim($data['phone_number']) : '9876543210'));
    $patientId = isset($data['patient_id']) ? trim($data['patient_id']) : ($_SESSION['patient_id'] ?? '');

    $doctorName = isset($data['doctor_name']) ? trim($data['doctor_name']) : (isset($data['doctorName']) ? trim($data['doctorName']) : 'Dr. Ananya Mehta');
    $doctorRole = isset($data['doctor_role']) ? trim($data['doctor_role']) : (isset($data['doctorRole']) ? trim($data['doctorRole']) : 'Ayurveda Physician');
    $appointmentDateRaw = isset($data['appointment_date']) ? trim($data['appointment_date']) : (isset($data['date']) ? trim($data['date']) : date('Y-m-d'));
    $appointmentTime = isset($data['appointment_time']) ? trim($data['appointment_time']) : (isset($data['time']) ? trim($data['time']) : '07:00 - 07:45 PM');
    $duration = isset($data['duration']) ? trim($data['duration']) : '45 min';
    $agenda = isset($data['agenda']) ? trim($data['agenda']) : "Package Enrollment for {$packageName}";
    $paymentMethod = isset($data['payment_method']) ? trim($data['payment_method']) : (isset($data['paymentMethod']) ? trim($data['paymentMethod']) : 'Card');
    $amount = isset($data['amount']) ? (float)$data['amount'] : (isset($data['fee']) ? (float)str_replace(['₹', ','], '', $data['fee']) : 500.00);

    // Normalize appointment date to YYYY-MM-DD
    $appointmentDate = date('Y-m-d');
    if (!empty($appointmentDateRaw)) {
        $parsedTime = strtotime($appointmentDateRaw);
        if ($parsedTime !== false) {
            $appointmentDate = date('Y-m-d', $parsedTime);
        }
    }

    // Phone digits
    $phoneDigits = preg_replace('/[^\d]/', '', $patientPhone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    // 1. Resolve Patient in `patients` table
    $patientDbId = 0;
    $finalPatientCode = $patientId;

    $findPatientQuery = "SELECT id, patient_id, full_name, email, phone_number, package_name, total_appointments FROM patients WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) OR (email != '' AND email = ?) OR (patient_id != '' AND patient_id = ?) LIMIT 1";
    if ($pStmt = mysqli_prepare($connection1, $findPatientQuery)) {
        mysqli_stmt_bind_param($pStmt, "ssss", $patientPhone, $phoneDigits, $patientEmail, $patientId);
        mysqli_stmt_execute($pStmt);
        $pRes = mysqli_stmt_get_result($pStmt);
        $existingPatient = mysqli_fetch_assoc($pRes);
        mysqli_stmt_close($pStmt);

        if ($existingPatient) {
            $patientDbId = (int)$existingPatient['id'];
            $finalPatientCode = $existingPatient['patient_id'];

            // Update patient's enrolled package & increment total appointments
            $updatePQuery = "UPDATE patients SET package_name = ?, full_name = ?, email = ?, total_appointments = total_appointments + 1, status = 'Ongoing', updated_at = NOW() WHERE id = ?";
            if ($upStmt = mysqli_prepare($connection1, $updatePQuery)) {
                mysqli_stmt_bind_param($upStmt, "sssi", $packageName, $patientName, $patientEmail, $patientDbId);
                mysqli_stmt_execute($upStmt);
                mysqli_stmt_close($upStmt);
            }
        } else {
            // Generate new patient_id if not present
            if (empty($finalPatientCode)) {
                $finalPatientCode = 'P' . rand(100, 999);
            }
            $insertPQuery = "INSERT INTO patients (patient_id, full_name, phone_number, email, package_name, total_appointments, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 'Ongoing', NOW(), NOW())";
            if ($inStmt = mysqli_prepare($connection1, $insertPQuery)) {
                mysqli_stmt_bind_param($inStmt, "sssss", $finalPatientCode, $patientName, $patientPhone, $patientEmail, $packageName);
                mysqli_stmt_execute($inStmt);
                $patientDbId = mysqli_insert_id($connection1);
                mysqli_stmt_close($inStmt);
            }
        }
    }

    // 2. Resolve Doctor in `doctors` table
    $doctorDbId = 1;
    $docQuery = "SELECT id, full_name FROM doctors WHERE (full_name != '' AND (full_name = ? OR full_name LIKE ?)) OR status = 'Active' ORDER BY id ASC LIMIT 1";
    if ($dStmt = mysqli_prepare($connection1, $docQuery)) {
        $docLike = '%' . $doctorName . '%';
        mysqli_stmt_bind_param($dStmt, "ss", $doctorName, $docLike);
        mysqli_stmt_execute($dStmt);
        $dRes = mysqli_stmt_get_result($dStmt);
        $docRow = mysqli_fetch_assoc($dRes);
        if ($docRow) {
            $doctorDbId = (int)$docRow['id'];
        }
        mysqli_stmt_close($dStmt);
    }

    // 3. Increment `enrollments` in `packages` table
    $updatePkgQuery = "UPDATE packages SET enrollments = enrollments + 1, updated_at = NOW() WHERE package_name = ? OR package_name LIKE ?";
    if ($pkgStmt = mysqli_prepare($connection1, $updatePkgQuery)) {
        $pkgLike = '%' . $packageName . '%';
        mysqli_stmt_bind_param($pkgStmt, "ss", $packageName, $pkgLike);
        mysqli_stmt_execute($pkgStmt);
        mysqli_stmt_close($pkgStmt);
    }

    // 4. Generate unique Appointment ID (e.g. APT-20260930-842 or ABC-492)
    $appointmentCode = 'APT-' . date('Ymd') . '-' . rand(100, 999);
    $bookingIdNumber = rand(100000, 999999);

    // 5. Insert Scheduled Appointment into `appointments` table
    $insertApptQuery = "INSERT INTO appointments (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Package Consultation', ?, 'Scheduled', NOW(), NOW())";
    if ($aStmt = mysqli_prepare($connection1, $insertApptQuery)) {
        mysqli_stmt_bind_param($aStmt, "sisissssss", $appointmentCode, $patientDbId, $patientName, $doctorDbId, $doctorName, $packageName, $appointmentDate, $appointmentTime, $duration, $agenda);
        mysqli_stmt_execute($aStmt);
        mysqli_stmt_close($aStmt);
    }

    // Update Session
    $_SESSION['package_name'] = $packageName;

    sendJsonResponse(true, 'Package consultation booked and package enrolled successfully!', [
        'booking_id' => '#' . $bookingIdNumber,
        'appointment_id' => $appointmentCode,
        'package_name' => $packageName,
        'doctor_name' => $doctorName,
        'doctor_role' => $doctorRole,
        'patient_name' => $patientName,
        'patient_id' => $finalPatientCode,
        'date' => $appointmentDateRaw,
        'time' => $appointmentTime,
        'amount' => '₹' . number_format($amount, 2),
        'status' => 'Scheduled'
    ], 200);
}

sendJsonResponse(false, 'Invalid request method or action.', [], 400);
