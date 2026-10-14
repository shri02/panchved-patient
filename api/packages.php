<?php
/**
 * Ocayur Patient Portal - Packages Backend API
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

$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($requestMethod === 'OPTIONS') {
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
// Resolve Patient Helper for Packages API
// --------------------------------------------------------------------------
function resolvePatientForPackages($connection1, $phone = '', $patientId = '', $email = '') {
    $phone = trim((string)$phone);
    $patientId = trim((string)$patientId);
    $email = trim((string)$email);

    if (empty($phone) && isset($_SESSION['phone_number'])) {
        $phone = trim((string)$_SESSION['phone_number']);
    }
    if (empty($patientId) && isset($_SESSION['patient_id'])) {
        $patientId = trim((string)$_SESSION['patient_id']);
    }
    if (empty($email) && isset($_SESSION['email'])) {
        $email = trim((string)$_SESSION['email']);
    }

    $phoneDigits = preg_replace('/[^\d]/', '', $phone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    if (empty($phone) && empty($phoneDigits) && empty($patientId) && empty($email)) {
        return null;
    }

    $pQuery = "SELECT id, patient_id, full_name, email, phone_number, package_name, total_appointments, status, created_at, updated_at FROM patients WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) OR (patient_id != '' AND patient_id = ?) OR (email != '' AND email = ?) LIMIT 1";
    if ($stmt = mysqli_prepare($connection1, $pQuery)) {
        mysqli_stmt_bind_param($stmt, "ssss", $phone, $phoneDigits, $patientId, $email);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        $patient = mysqli_fetch_assoc($res);
        mysqli_stmt_close($stmt);
        return $patient;
    }
    return null;
}

// --------------------------------------------------------------------------
// Category 1: Get All Packages Created & Added to System
// --------------------------------------------------------------------------
function getAllPackagesList($connection1) {
    $query = "SELECT * FROM packages WHERE status = 'Active' ORDER BY id ASC";
    $result = mysqli_query($connection1, $query);
    $packages = [];

    if ($result) {
        while ($row = mysqli_fetch_assoc($result)) {
            $packages[] = formatPackageRecord($row, $connection1);
        }
    }
    return $packages;
}

// --------------------------------------------------------------------------
// Category 2: Get Recommended Packages Specifically Recommended by Doctor
// --------------------------------------------------------------------------
function getRecommendedPackagesForPatient($connection1, $patient) {
    $recommended = [];
    $seenIds = [];

    $patientDbId = $patient ? (int)$patient['id'] : 0;
    $patientPhone = $patient ? trim((string)$patient['phone_number']) : '';
    $phoneDigits = preg_replace('/[^\d]/', '', $patientPhone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    // 1. Fetch from `recommended_packages` table
    $recSql = "SELECT r.id AS recommendation_id, r.package_id, r.package_name, r.doctor_id, r.doctor_name, r.recommendation_note, r.status AS recommendation_status, r.created_at AS recommended_date, p.* 
               FROM recommended_packages r 
               LEFT JOIN packages p ON (p.id = r.package_id OR (p.package_name = r.package_name COLLATE utf8mb4_unicode_ci))
               WHERE ((r.patient_id > 0 AND r.patient_id = ?) OR (r.patient_phone != '' AND (r.patient_phone = ? OR r.patient_phone = ?)))
                 AND r.status != 'Dismissed'
               ORDER BY r.id DESC";

    if ($stmt = mysqli_prepare($connection1, $recSql)) {
        mysqli_stmt_bind_param($stmt, "iss", $patientDbId, $patientPhone, $phoneDigits);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        while ($row = mysqli_fetch_assoc($res)) {
            $formatted = formatPackageRecord($row, $connection1);
            $formatted['recommendation_id'] = (int)$row['recommendation_id'];
            $formatted['recommended_by_doctor'] = !empty($row['doctor_name']) ? $row['doctor_name'] : ($formatted['doctor']['name'] ?? 'Dr. Nidhi Jha');
            $formatted['recommendation_note'] = !empty($row['recommendation_note']) ? $row['recommendation_note'] : 'Specifically recommended by your consulting physician based on clinical assessment and dosha evaluation.';
            $formatted['recommendation_status'] = $row['recommendation_status'] ?? 'Recommended';
            $formatted['recommended_date'] = !empty($row['recommended_date']) ? date('d M Y', strtotime($row['recommended_date'])) : date('d M Y');

            $key = $formatted['id'] ?: $formatted['package_name'];
            if (!isset($seenIds[$key])) {
                $seenIds[$key] = true;
                $recommended[] = $formatted;
            }
        }
        mysqli_stmt_close($stmt);
    }

    // Strict requirement: Only display packages specifically assigned by the doctor.
    // If no packages are assigned by the doctor for this patient, return empty array (no other packages appear).
    return $recommended;
}

// --------------------------------------------------------------------------
// Category 3: Get My Packages (All packages booked & stored for the patient)
// --------------------------------------------------------------------------
function getMyBookedPackagesForPatient($connection1, $patient) {
    $myPackages = [];
    $seenNames = [];

    $patientDbId = $patient ? (int)$patient['id'] : 0;
    $patientPhone = $patient ? trim((string)$patient['phone_number']) : '';
    $patientName = $patient ? trim((string)$patient['full_name']) : '';
    $phoneDigits = preg_replace('/[^\d]/', '', $patientPhone);
    if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
        $phoneDigits = substr($phoneDigits, 2);
    }

    // 1. Fetch from `patient_packages` table
    $ppSql = "SELECT pp.*, p.overview, p.short_description, p.image_url, p.benefits, p.duration AS pkg_duration, p.price AS pkg_price, p.assigned_doctor AS pkg_doctor
              FROM patient_packages pp
              LEFT JOIN packages p ON (p.id = pp.package_id OR (p.package_name = pp.package_name COLLATE utf8mb4_unicode_ci))
              WHERE ((pp.patient_id > 0 AND pp.patient_id = ?) OR (pp.patient_phone != '' AND (pp.patient_phone = ? OR pp.patient_phone = ?)))
              ORDER BY pp.id DESC";

    if ($stmt = mysqli_prepare($connection1, $ppSql)) {
        mysqli_stmt_bind_param($stmt, "iss", $patientDbId, $patientPhone, $phoneDigits);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        while ($row = mysqli_fetch_assoc($res)) {
            $pkgName = cleanPackageName($row['package_name']);
            if (empty($pkgName)) continue;

            $formatted = formatPackageRecord($row, $connection1);
            $formatted['booking_id'] = !empty($row['booking_id']) ? $row['booking_id'] : ('#PKG' . str_pad($row['id'], 5, '0', STR_PAD_LEFT));
            $formatted['booking_date'] = !empty($row['booking_date']) ? date('d M Y', strtotime($row['booking_date'])) : date('d M Y', strtotime($row['created_at']));
            $formatted['booking_status'] = !empty($row['status']) ? $row['status'] : 'Active';
            $formatted['booked_doctor'] = !empty($row['doctor_name']) ? $row['doctor_name'] : ($formatted['doctor']['name'] ?? 'Dr. Nidhi Jha');

            $key = strtolower($pkgName);
            if (!isset($seenNames[$key])) {
                $seenNames[$key] = true;
                $myPackages[] = $formatted;
            }
        }
        mysqli_stmt_close($stmt);
    }

    // 2. Fetch from `appointments` table (where package consultation or package booked)
    $apptSql = "SELECT a.id AS appt_id, a.appointment_id, a.package_name, a.doctor_name, a.appointment_date, a.appointment_time, a.status AS appt_status, a.created_at, p.*
                FROM appointments a
                LEFT JOIN packages p ON (p.package_name = a.package_name COLLATE utf8mb4_unicode_ci)
                WHERE ((a.patient_id > 0 AND a.patient_id = ?) OR (a.patient_name != '' AND a.patient_name = ?) OR (? != '' AND a.patient_id IN (SELECT id FROM patients WHERE phone_number = ? OR phone_number = ?)))
                  AND a.package_name IS NOT NULL
                  AND a.package_name != ''
                  AND a.package_name NOT IN ('General Consultation', 'Consultation & Rehab')
                ORDER BY a.id DESC";

    if ($stmt = mysqli_prepare($connection1, $apptSql)) {
        mysqli_stmt_bind_param($stmt, "issss", $patientDbId, $patientName, $patientPhone, $patientPhone, $phoneDigits);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        while ($row = mysqli_fetch_assoc($res)) {
            $pkgName = cleanPackageName($row['package_name']);
            if (empty($pkgName)) continue;

            $key = strtolower($pkgName);
            if (!isset($seenNames[$key])) {
                $formatted = formatPackageRecord($row, $connection1);
                $formatted['booking_id'] = !empty($row['appointment_id']) ? ('#' . str_replace(['APT-', '-'], '', $row['appointment_id'])) : ('#APT' . $row['appt_id']);
                $formatted['booking_date'] = !empty($row['appointment_date']) ? date('d M Y', strtotime($row['appointment_date'])) : date('d M Y', strtotime($row['created_at']));
                $formatted['booking_status'] = 'Active';
                $formatted['booked_doctor'] = !empty($row['doctor_name']) ? $row['doctor_name'] : ($formatted['doctor']['name'] ?? 'Dr. Nidhi Jha');

                $seenNames[$key] = true;
                $myPackages[] = $formatted;
            }
        }
        mysqli_stmt_close($stmt);
    }

    // 3. Check `patients.package_name`
    if ($patient && !empty($patient['package_name'])) {
        $pPkgName = cleanPackageName($patient['package_name']);
        $key = strtolower($pPkgName);
        if (!empty($pPkgName) && !isset($seenNames[$key]) && $pPkgName !== 'general consultation') {
            $fSql = "SELECT * FROM packages WHERE package_name = ? OR package_name LIKE ? LIMIT 1";
            if ($fStmt = mysqli_prepare($connection1, $fSql)) {
                $like = '%' . $pPkgName . '%';
                mysqli_stmt_bind_param($fStmt, "ss", $pPkgName, $like);
                mysqli_stmt_execute($fStmt);
                $fRes = mysqli_stmt_get_result($fStmt);
                $row = mysqli_fetch_assoc($fRes);
                mysqli_stmt_close($fStmt);

                if ($row) {
                    $formatted = formatPackageRecord($row, $connection1);
                } else {
                    $formatted = [
                        'id' => 0,
                        'package_id' => 'PKG-ENROLLED',
                        'package_name' => $pPkgName,
                        'category' => 'Ayurveda Care',
                        'duration' => '3 Months',
                        'price' => 7999.0,
                        'price_formatted' => '₹7,999',
                        'enrollments' => 1,
                        'batch_text' => 'Enrolled Batch',
                        'short_description' => 'Tailored holistic therapy and lifestyle care program.',
                        'overview' => 'Personalized multi-dimensional Ayurvedic wellness protocol.',
                        'image_url' => 'assets/gut-healing-pkg.jpg',
                        'doctor' => resolveDoctorForPackage($connection1, '', $pPkgName)
                    ];
                }

                $formatted['booking_id'] = '#ENR-' . ($patient['patient_id'] ?: 'P001');
                $formatted['booking_date'] = !empty($patient['created_at']) ? date('d M Y', strtotime($patient['created_at'])) : date('d M Y');
                $formatted['booking_status'] = !empty($patient['status']) ? $patient['status'] : 'Ongoing';
                $formatted['booked_doctor'] = $formatted['doctor']['name'] ?? 'Dr. Nidhi Jha';

                $seenNames[$key] = true;
                $myPackages[] = $formatted;
            }
        }
    }

    return $myPackages;
}

// --------------------------------------------------------------------------
// 1. GET REQUESTS
// --------------------------------------------------------------------------
if ($requestMethod === 'GET') {
    $action = isset($_GET['action']) ? trim($_GET['action']) : 'list';
    $phone = isset($_GET['phone']) ? trim($_GET['phone']) : ($_SESSION['phone_number'] ?? '');
    $patientId = isset($_GET['patient_id']) ? trim($_GET['patient_id']) : ($_SESSION['patient_id'] ?? '');

    // ACTION: SINGLE PACKAGE DETAILS
    if ($action === 'details' || isset($_GET['id']) || isset($_GET['package_id']) || (isset($_GET['name']) && $action !== 'all' && $action !== 'recommended' && $action !== 'my_packages')) {
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

    // ACTION: ALL PACKAGES (Category 1)
    if ($action === 'list' || $action === 'all' || $action === 'all_packages') {
        $packages = getAllPackagesList($connection1);
        sendJsonResponse(true, 'All health packages loaded successfully from database.', [
            'count' => count($packages),
            'packages' => $packages
        ]);
    }

    // ACTION: RECOMMENDED PACKAGES (Category 2)
    if ($action === 'recommended' || $action === 'recommended_packages') {
        $patient = resolvePatientForPackages($connection1, $phone, $patientId);
        $recommended = getRecommendedPackagesForPatient($connection1, $patient);
        sendJsonResponse(true, 'Recommended packages for patient fetched successfully.', [
            'count' => count($recommended),
            'packages' => $recommended,
            'patient' => $patient ? [
                'id' => (int)$patient['id'],
                'patient_id' => $patient['patient_id'],
                'full_name' => $patient['full_name']
            ] : null
        ]);
    }

    // ACTION: MY PACKAGES (Category 3 - Booked Packages)
    if ($action === 'my_packages' || $action === 'booked' || $action === 'booked_packages') {
        $patient = resolvePatientForPackages($connection1, $phone, $patientId);
        $myPackages = getMyBookedPackagesForPatient($connection1, $patient);
        sendJsonResponse(true, 'My booked packages loaded successfully from database.', [
            'count' => count($myPackages),
            'packages' => $myPackages,
            'patient' => $patient ? [
                'id' => (int)$patient['id'],
                'patient_id' => $patient['patient_id'],
                'full_name' => $patient['full_name']
            ] : null
        ]);
    }

    // ACTION: ALL CATEGORIES IN A SINGLE UNIFIED RESPONSE
    if ($action === 'categories' || $action === 'all_sections') {
        $patient = resolvePatientForPackages($connection1, $phone, $patientId);
        $allPkgs = getAllPackagesList($connection1);
        $recPkgs = getRecommendedPackagesForPatient($connection1, $patient);
        $myPkgs = getMyBookedPackagesForPatient($connection1, $patient);

        sendJsonResponse(true, 'All package categories loaded successfully from database.', [
            'categories' => [
                'all' => $allPkgs,
                'recommended' => $recPkgs,
                'my' => $myPkgs
            ],
            'counts' => [
                'all' => count($allPkgs),
                'recommended' => count($recPkgs),
                'my' => count($myPkgs)
            ],
            'patient' => $patient ? [
                'id' => (int)$patient['id'],
                'patient_id' => $patient['patient_id'],
                'full_name' => $patient['full_name']
            ] : null
        ]);
    }

    // ACTION: MY ENROLLED PACKAGE (Backwards compatibility)
    if ($action === 'my_package') {
        $patient = resolvePatientForPackages($connection1, $phone, $patientId);
        $packageName = cleanPackageName($patient['package_name'] ?? 'Gut Healing Package');

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
if ($requestMethod === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);
    if (!$data || !is_array($data)) {
        $data = $_POST;
    }

    $action = isset($data['action']) ? trim($data['action']) : 'enroll';
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

    // 6. Store in `patient_packages` table for "My Packages" section
    $bookingCode = '#' . $bookingIdNumber;
    $pkgDbId = 0;
    $fPkg = mysqli_query($connection1, "SELECT id FROM packages WHERE package_name = '" . mysqli_real_escape_string($connection1, $packageName) . "' OR package_name LIKE '%" . mysqli_real_escape_string($connection1, $packageName) . "%' LIMIT 1");
    if ($fPkg && $pRow = mysqli_fetch_assoc($fPkg)) {
        $pkgDbId = (int)$pRow['id'];
    }

    $insPpkg = mysqli_prepare($connection1, "INSERT INTO patient_packages (booking_id, patient_id, patient_phone, package_id, package_name, doctor_name, price, booking_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', NOW(), NOW())");
    if ($insPpkg) {
        mysqli_stmt_bind_param($insPpkg, "sisisdss", $bookingCode, $patientDbId, $patientPhone, $pkgDbId, $packageName, $doctorName, $amount, $appointmentDate);
        mysqli_stmt_execute($insPpkg);
        mysqli_stmt_close($insPpkg);
    }

    // 7. Update status of recommended package to 'Accepted' if this was a recommended package
    $upRec = mysqli_prepare($connection1, "UPDATE recommended_packages SET status = 'Accepted' WHERE (patient_id = ? OR patient_phone = ?) AND (package_name = ? OR package_id = ?)");
    if ($upRec) {
        mysqli_stmt_bind_param($upRec, "issi", $patientDbId, $patientPhone, $packageName, $pkgDbId);
        mysqli_stmt_execute($upRec);
        mysqli_stmt_close($upRec);
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
