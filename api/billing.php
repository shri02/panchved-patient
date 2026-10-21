<?php
/**
 * Ocayur Patient Portal - Billing & Payment History API
 * Dynamically fetches successful payments, invoices, active package details,
 * and receipt breakdowns directly from MySQL database schema.
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

// Helper: Convert Number to Words (Indian Rupees)
function numberToWordsIndian($number) {
    $num = (int)$number;
    if ($num <= 0) return 'Zero Rupees Only';

    $ones = [
        0 => '', 1 => 'One', 2 => 'Two', 3 => 'Three', 4 => 'Four', 5 => 'Five',
        6 => 'Six', 7 => 'Seven', 8 => 'Eight', 9 => 'Nine', 10 => 'Ten',
        11 => 'Eleven', 12 => 'Twelve', 13 => 'Thirteen', 14 => 'Fourteen', 15 => 'Fifteen',
        16 => 'Sixteen', 17 => 'Seventeen', 18 => 'Eighteen', 19 => 'Nineteen'
    ];
    $tens = [
        2 => 'Twenty', 3 => 'Thirty', 4 => 'Forty', 5 => 'Fifty',
        6 => 'Sixty', 7 => 'Seventy', 8 => 'Eighty', 9 => 'Ninety'
    ];

    $convertHundreds = function($n) use ($ones, $tens) {
        $str = '';
        if ($n >= 100) {
            $str .= $ones[(int)($n / 100)] . ' Hundred ';
            $n %= 100;
        }
        if ($n > 0) {
            if ($n < 20) {
                $str .= $ones[$n] . ' ';
            } else {
                $str .= $tens[(int)($n / 10)] . ' ';
                if ($n % 10 > 0) {
                    $str .= $ones[$n % 10] . ' ';
                }
            }
        }
        return trim($str);
    };

    $crore = floor($num / 10000000);
    $num %= 10000000;
    $lakh = floor($num / 100000);
    $num %= 100000;
    $thousand = floor($num / 1000);
    $num %= 1000;
    $hundred = $num;

    $parts = [];
    if ($crore > 0) $parts[] = $convertHundreds($crore) . ' Crore';
    if ($lakh > 0) $parts[] = $convertHundreds($lakh) . ' Lakh';
    if ($thousand > 0) $parts[] = $convertHundreds($thousand) . ' Thousand';
    if ($hundred > 0) $parts[] = $convertHundreds($hundred);

    $wordStr = implode(' ', $parts);
    return trim($wordStr) . ' Rupees Only';
}

$action = isset($_GET['action']) ? trim($_GET['action']) : 'list';

// --------------------------------------------------------------------------
// 1. Resolve Current Patient Identity from Database
// --------------------------------------------------------------------------
$phone = isset($_GET['phone']) ? trim($_GET['phone']) : ($_SESSION['phone_number'] ?? '');
$email = isset($_GET['email']) ? trim($_GET['email']) : ($_SESSION['email'] ?? '');
$patientId = isset($_GET['patient_id']) ? trim($_GET['patient_id']) : ($_SESSION['patient_id'] ?? '');
$userId = isset($_GET['user_id']) ? intval($_GET['user_id']) : ($_SESSION['user_id'] ?? 0);

$phoneDigits = preg_replace('/[^\d]/', '', $phone);
if (strlen($phoneDigits) === 12 && substr($phoneDigits, 0, 2) === '91') {
    $phoneDigits = substr($phoneDigits, 2);
}

$patient = null;
if ($connection1 && (!empty($phone) || !empty($phoneDigits) || !empty($email) || !empty($patientId))) {
    $pQuery = "SELECT id, patient_id, full_name, dob, age, phone_number, gender, email, blood_group, package_name, total_appointments, status, created_at 
               FROM patients 
               WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) 
                  OR (email != '' AND email = ?) 
                  OR (patient_id != '' AND patient_id = ?) 
               LIMIT 1";
    if ($stmt = mysqli_prepare($connection1, $pQuery)) {
        mysqli_stmt_bind_param($stmt, "ssss", $phone, $phoneDigits, $email, $patientId);
        mysqli_stmt_execute($stmt);
        $res = mysqli_stmt_get_result($stmt);
        $patient = mysqli_fetch_assoc($res);
        mysqli_stmt_close($stmt);
    }
}

// If patient not found in patients table, check users table
if (!$patient && $connection1 && (!empty($phone) || !empty($phoneDigits) || !empty($email) || $userId > 0)) {
    $uQuery = "SELECT id, full_name, email, phone_number, role, created_at FROM users 
               WHERE (phone_number != '' AND (phone_number = ? OR phone_number = ?)) 
                  OR (email != '' AND email = ?) 
                  OR (id = ? AND ? > 0) 
               LIMIT 1";
    if ($uStmt = mysqli_prepare($connection1, $uQuery)) {
        mysqli_stmt_bind_param($uStmt, "sssii", $phone, $phoneDigits, $email, $userId, $userId);
        mysqli_stmt_execute($uStmt);
        $uRes = mysqli_stmt_get_result($uStmt);
        if ($uRow = mysqli_fetch_assoc($uRes)) {
            $patient = [
                'id' => (int)$uRow['id'],
                'patient_id' => 'P00' . $uRow['id'],
                'full_name' => $uRow['full_name'],
                'phone_number' => $uRow['phone_number'],
                'email' => $uRow['email'],
                'gender' => 'Male',
                'age' => 28,
                'package_name' => '',
                'total_appointments' => 0,
                'status' => 'Active',
                'created_at' => $uRow['created_at']
            ];
        }
        mysqli_stmt_close($uStmt);
    }
}

// Fallback if no specific user identity was passed at all
if (!$patient && $connection1 && empty($phone) && empty($email) && empty($patientId) && $userId <= 0) {
    $res = mysqli_query($connection1, "SELECT * FROM patients ORDER BY id ASC LIMIT 1");
    if ($res && ($row = mysqli_fetch_assoc($res))) {
        $patient = $row;
    }
}

if (!$patient) {
    $patient = [
        'id' => $_SESSION['patient_id'] ?? 1,
        'patient_id' => !empty($_SESSION['patient_id']) ? ('P00' . $_SESSION['patient_id']) : 'P001',
        'full_name' => $_SESSION['full_name'] ?? 'Patient',
        'phone_number' => $_SESSION['phone_number'] ?? '',
        'email' => $_SESSION['email'] ?? '',
        'gender' => 'Male',
        'age' => 28,
        'package_name' => '',
        'total_appointments' => 0,
        'status' => 'Ongoing'
    ];
}

$patDbId = (int)$patient['id'];
$patName = $patient['full_name'] ?: 'Patient';
$patPhone = $patient['phone_number'] ?: '';
$patAge = !empty($patient['age']) ? (int)$patient['age'] : 28;
$patGender = !empty($patient['gender']) ? $patient['gender'] : 'Male';

// --------------------------------------------------------------------------
// 2. ACTION: GET SINGLE RECEIPT DETAILS DYNAMICALLY FROM DATABASE
// --------------------------------------------------------------------------
if ($action === 'receipt_details' || $action === 'receipt' || $action === 'download_receipt') {
    $targetId = isset($_GET['id']) ? intval($_GET['id']) : 0;
    $targetBillingId = isset($_GET['billing_id']) ? trim($_GET['billing_id']) : (isset($_GET['appointment_id']) ? trim($_GET['appointment_id']) : '');
    $targetReceiptNo = isset($_GET['receipt_no']) ? trim($_GET['receipt_no']) : '';

    $receiptData = null;

    if ($connection1 && ($targetId > 0 || !empty($targetBillingId) || !empty($targetReceiptNo))) {
        
        // ------------------------------------------------------------------
        // Case A: Workshop Booking (WS-RCP-xxx, WS-xxx, or id in 1000..1999)
        // ------------------------------------------------------------------
        $isWorkshop = stripos($targetReceiptNo, 'WS-') !== false || 
                      stripos($targetBillingId, 'WS-') !== false || 
                      ($targetId >= 1000 && $targetId < 2000);

        if ($isWorkshop || !$receiptData) {
            $wsNumericId = $targetId >= 1000 ? ($targetId - 1000) : $targetId;
            $wsReceiptClean = preg_replace('/^WS-RCP-/i', '', $targetReceiptNo);
            $wsReceiptClean = preg_replace('/^WS-/i', '', $wsReceiptClean);
            if (is_numeric($wsReceiptClean) && (int)$wsReceiptClean > 0 && $wsNumericId <= 0) {
                $wsNumericId = (int)$wsReceiptClean;
            }

            $wsSql = "SELECT wb.*, w.title as ws_title, w.time as ws_time, w.date as ws_date, 
                             w.speaker as ws_speaker, w.assign_speaker as ws_assign_speaker, 
                             w.instructor as ws_instructor, w.speaker_role
                      FROM workshop_bookings wb 
                      LEFT JOIN workshops w ON (wb.workshop_id = w.id OR wb.workshop_id = w.workshop_id) 
                      WHERE wb.id = ? OR wb.booking_id = ? OR wb.booking_id = ? OR wb.id = ? 
                      LIMIT 1";

            if ($wStmt = mysqli_prepare($connection1, $wsSql)) {
                mysqli_stmt_bind_param($wStmt, "issi", $wsNumericId, $targetBillingId, $targetReceiptNo, $wsNumericId);
                mysqli_stmt_execute($wStmt);
                $wRes = mysqli_stmt_get_result($wStmt);
                $wsRow = mysqli_fetch_assoc($wRes);
                mysqli_stmt_close($wStmt);

                if ($wsRow) {
                    $wsAmount = (float)($wsRow['amount'] ?? 799.00);
                    $wsTitle = !empty($wsRow['ws_title']) ? $wsRow['ws_title'] : 'Ayurveda Workshop';
                    $wsDate = !empty($wsRow['booking_date']) ? date('j M Y', strtotime($wsRow['booking_date'])) : (!empty($wsRow['ws_date']) ? date('j M Y', strtotime($wsRow['ws_date'])) : date('j M Y'));
                    $wsTime = !empty($wsRow['ws_time']) ? $wsRow['ws_time'] : '8:00 AM';
                    $speakerName = !empty($wsRow['ws_speaker']) ? $wsRow['ws_speaker'] : (!empty($wsRow['ws_assign_speaker']) ? $wsRow['ws_assign_speaker'] : (!empty($wsRow['ws_instructor']) ? $wsRow['ws_instructor'] : 'Dr. Nidhi Jha'));
                    $speakerRole = !empty($wsRow['speaker_role']) ? $wsRow['speaker_role'] : 'Ayurveda Physician';
                    $billedName = !empty($wsRow['doctor_name']) ? $wsRow['doctor_name'] : $patName;

                    $receiptData = [
                        'id' => 1000 + (int)$wsRow['id'],
                        'receipt_no' => 'WS-RCP-' . str_pad($wsRow['id'], 3, '0', STR_PAD_LEFT),
                        'billing_id' => $wsRow['booking_id'] ?: ('WS-' . str_pad($wsRow['id'], 3, '0', STR_PAD_LEFT)),
                        'invoice_date' => $wsDate,
                        'visit_date' => "{$wsDate} {$wsTime}",
                        'billed_to' => [
                            'name' => $billedName,
                            'gender' => $patGender,
                            'age' => "{$patAge} years"
                        ],
                        'doctor' => [
                            'name' => $speakerName,
                            'role' => $speakerRole
                        ],
                        'package_name' => $wsTitle,
                        'service_type' => 'Ayurveda Workshop Session',
                        'items' => [
                            [
                                's_no' => '01',
                                'service' => $wsTitle,
                                'qty' => '01',
                                'amount' => '₹' . number_format($wsAmount, 0),
                                'discount' => '0',
                                'total' => '₹' . number_format($wsAmount, 0)
                            ]
                        ],
                        'subtotal' => '₹' . number_format($wsAmount, 0),
                        'discount' => '₹0',
                        'grand_total' => '₹' . number_format($wsAmount, 0),
                        'amount_words' => numberToWordsIndian($wsAmount),
                        'payment_method' => ucfirst($wsRow['payment_method'] ?: 'Card'),
                        'payment_status' => 'Success'
                    ];
                }
            }
        }

        // ------------------------------------------------------------------
        // Case B: Patient Package Booking (PKG-RCP-xxx, #PKG, or id >= 2000)
        // ------------------------------------------------------------------
        $isPkg = stripos($targetReceiptNo, 'PKG-') !== false || 
                 stripos($targetBillingId, 'PKG') !== false || 
                 $targetId >= 2000;

        if (!$receiptData && ($isPkg || $targetId > 0 || !empty($targetBillingId))) {
            $pkgNumericId = $targetId >= 2000 ? ($targetId - 2000) : $targetId;
            $pkgReceiptClean = preg_replace('/^PKG-RCP-/i', '', $targetReceiptNo);
            if (is_numeric($pkgReceiptClean) && (int)$pkgReceiptClean > 0 && $pkgNumericId <= 0) {
                $pkgNumericId = (int)$pkgReceiptClean;
            }

            $ppSql = "SELECT pp.*, p.short_description, p.duration as pkg_duration, p.price as pkg_price, 
                             p.assigned_doctor, pat.gender as pat_gender, pat.age as pat_age, pat.full_name as pat_full_name
                      FROM patient_packages pp
                      LEFT JOIN packages p ON (p.id = pp.package_id OR p.package_name = pp.package_name COLLATE utf8mb4_unicode_ci)
                      LEFT JOIN patients pat ON (pp.patient_id = pat.id)
                      WHERE pp.id = ? OR pp.booking_id = ? OR pp.booking_id = ? OR pp.id = ? 
                      LIMIT 1";

            if ($ppStmt = mysqli_prepare($connection1, $ppSql)) {
                mysqli_stmt_bind_param($ppStmt, "issi", $pkgNumericId, $targetBillingId, $targetReceiptNo, $pkgNumericId);
                mysqli_stmt_execute($ppStmt);
                $ppRes = mysqli_stmt_get_result($ppStmt);
                $ppRow = mysqli_fetch_assoc($ppRes);
                mysqli_stmt_close($ppStmt);

                if ($ppRow) {
                    $pkgAmount = (float)($ppRow['price'] > 0 ? $ppRow['price'] : ($ppRow['pkg_price'] ?? 5000.00));
                    $pkgName = $ppRow['package_name'] ?: 'Ayurveda Wellness Package';
                    $pkgDate = !empty($ppRow['booking_date']) ? date('j M Y', strtotime($ppRow['booking_date'])) : date('j M Y', strtotime($ppRow['created_at']));
                    $pkgDoc = !empty($ppRow['doctor_name']) && $ppRow['doctor_name'] !== '0' ? $ppRow['doctor_name'] : (!empty($ppRow['assigned_doctor']) ? $ppRow['assigned_doctor'] : 'Dr. Nidhi Jha');
                    $billedName = !empty($ppRow['pat_full_name']) ? $ppRow['pat_full_name'] : $patName;
                    $billedGender = !empty($ppRow['pat_gender']) ? $ppRow['pat_gender'] : $patGender;
                    $billedAge = !empty($ppRow['pat_age']) ? (int)$ppRow['pat_age'] : $patAge;

                    $receiptData = [
                        'id' => 2000 + (int)$ppRow['id'],
                        'receipt_no' => 'PKG-RCP-' . str_pad($ppRow['id'], 3, '0', STR_PAD_LEFT),
                        'billing_id' => $ppRow['booking_id'] ?: ('#PKG' . str_pad($ppRow['id'], 5, '0', STR_PAD_LEFT)),
                        'invoice_date' => $pkgDate,
                        'visit_date' => "{$pkgDate} 10:00 AM",
                        'billed_to' => [
                            'name' => $billedName,
                            'gender' => $billedGender,
                            'age' => "{$billedAge} years"
                        ],
                        'doctor' => [
                            'name' => $pkgDoc,
                            'role' => 'Senior Ayurveda Physician'
                        ],
                        'package_name' => $pkgName,
                        'service_type' => 'Ayurveda Package Subscription',
                        'items' => [
                            [
                                's_no' => '01',
                                'service' => "{$pkgName} (Complete Wellness Program)",
                                'qty' => '01',
                                'amount' => '₹' . number_format($pkgAmount, 0),
                                'discount' => '0',
                                'total' => '₹' . number_format($pkgAmount, 0)
                            ]
                        ],
                        'subtotal' => '₹' . number_format($pkgAmount, 0),
                        'discount' => '₹0',
                        'grand_total' => '₹' . number_format($pkgAmount, 0),
                        'amount_words' => numberToWordsIndian($pkgAmount),
                        'payment_method' => 'Card / Online',
                        'payment_status' => 'Success'
                    ];
                }
            }
        }

        // ------------------------------------------------------------------
        // Case C: Consultation Appointment (EK-xxx, ABC-xxx, APT-xxx)
        // ------------------------------------------------------------------
        if (!$receiptData) {
            $apptSql = "SELECT a.*, p.price as pkg_price, p.duration as pkg_duration, p.short_description as pkg_desc,
                               pat.gender as pat_gender, pat.age as pat_age, pat.full_name as pat_full_name, pat.dob as pat_dob,
                               d.expertise as doc_expertise, d.area as doc_area
                        FROM appointments a
                        LEFT JOIN packages p ON (a.package_name = p.package_name OR p.package_name LIKE CONCAT('%', a.package_name, '%'))
                        LEFT JOIN patients pat ON (a.patient_id = pat.id OR a.patient_name = pat.full_name)
                        LEFT JOIN doctors d ON (a.doctor_id = d.id OR a.doctor_name = d.full_name)
                        WHERE a.id = ? OR a.appointment_id = ? OR a.appointment_id = ? OR a.id = ? 
                        LIMIT 1";

            if ($aStmt = mysqli_prepare($connection1, $apptSql)) {
                $rNoClean = preg_replace('/^EK-/i', '', $targetReceiptNo);
                $rNoInt = is_numeric($rNoClean) ? (int)$rNoClean : 0;
                $searchId = $targetId > 0 && $targetId < 1000 ? $targetId : $rNoInt;

                mysqli_stmt_bind_param($aStmt, "issi", $searchId, $targetBillingId, $targetReceiptNo, $searchId);
                mysqli_stmt_execute($aStmt);
                $aRes = mysqli_stmt_get_result($aStmt);
                $row = mysqli_fetch_assoc($aRes);
                mysqli_stmt_close($aStmt);

                if ($row) {
                    $rawDate = $row['appointment_date'];
                    $ts = strtotime($rawDate);
                    $formattedDate = $ts !== false ? date('j M Y', $ts) : date('j M Y');
                    
                    $timeDisplay = !empty($row['appointment_time']) ? $row['appointment_time'] : '9:30 AM';
                    if (strpos($timeDisplay, '-') !== false) {
                        $parts = explode('-', $timeDisplay);
                        $timeDisplay = trim($parts[0]);
                    }

                    $recPatientName = !empty($row['pat_full_name']) ? $row['pat_full_name'] : (!empty($row['patient_name']) ? $row['patient_name'] : $patName);
                    $recGender = !empty($row['pat_gender']) ? $row['pat_gender'] : $patGender;
                    $recAge = !empty($row['pat_age']) ? (int)$row['pat_age'] : $patAge;

                    $basePrice = !empty($row['pkg_price']) && (float)$row['pkg_price'] > 0 ? (float)$row['pkg_price'] : 500.00;
                    $discount = 0.00;
                    if ($basePrice >= 5000) {
                        $discount = 500.00;
                    }
                    $grandTotal = max(0, $basePrice - $discount);

                    $packageName = !empty($row['package_name']) ? $row['package_name'] : 'Ayurvedic Consultation';
                    $serviceName = !empty($row['service_type']) ? $row['service_type'] : $packageName;

                    $items = [
                        [
                            's_no' => '01',
                            'service' => $serviceName,
                            'qty' => '01',
                            'amount' => '₹' . number_format($basePrice, 0),
                            'discount' => $discount > 0 ? '₹' . number_format($discount, 0) : '0',
                            'total' => '₹' . number_format($grandTotal, 0)
                        ]
                    ];

                    $receiptData = [
                        'id' => (int)$row['id'],
                        'receipt_no' => 'EK-' . str_pad($row['id'], 3, '0', STR_PAD_LEFT),
                        'billing_id' => !empty($row['appointment_id']) ? $row['appointment_id'] : ('ABC-' . str_pad($row['id'], 3, '0', STR_PAD_LEFT)),
                        'invoice_date' => $formattedDate,
                        'visit_date' => "{$formattedDate} {$timeDisplay}",
                        'billed_to' => [
                            'name' => $recPatientName,
                            'gender' => $recGender,
                            'age' => "{$recAge} years"
                        ],
                        'doctor' => [
                            'name' => $row['doctor_name'] ?: 'Dr. Nidhi Jha',
                            'role' => $row['doc_expertise'] ?: 'Senior Ayurveda Physician'
                        ],
                        'package_name' => $packageName,
                        'service_type' => $serviceName,
                        'items' => $items,
                        'subtotal' => '₹' . number_format($basePrice, 0),
                        'discount' => '₹' . number_format($discount, 0),
                        'grand_total' => '₹' . number_format($grandTotal, 0),
                        'amount_words' => numberToWordsIndian($grandTotal),
                        'payment_method' => 'Card',
                        'payment_status' => 'Success'
                    ];
                }
            }
        }
    }

    if ($receiptData) {
        sendJsonResponse(true, 'Receipt data fetched successfully from database.', ['receipt' => $receiptData]);
    } else {
        sendJsonResponse(false, 'Receipt record not found in database.', [], 404);
    }
}

// --------------------------------------------------------------------------
// 3. Fetch Active Package Details Dynamically from Database
// --------------------------------------------------------------------------
$activePackage = null;

if ($connection1) {
    // A. First check `patient_packages` table for the patient's actively enrolled package
    $ppQuery = "SELECT pp.*, p.short_description, p.duration as pkg_duration, p.price as pkg_price, 
                       p.assigned_doctor, p.category
                FROM patient_packages pp
                LEFT JOIN packages p ON (p.id = pp.package_id OR p.package_name = pp.package_name COLLATE utf8mb4_unicode_ci)
                WHERE ((pp.patient_id > 0 AND pp.patient_id = ?) 
                   OR (pp.patient_phone != '' AND (? != '' AND (pp.patient_phone = ? OR pp.patient_phone = ?))))
                  AND pp.status IN ('Active', 'Ongoing')
                ORDER BY pp.id DESC 
                LIMIT 1";

    if ($ppStmt = mysqli_prepare($connection1, $ppQuery)) {
        mysqli_stmt_bind_param($ppStmt, "isss", $patDbId, $patPhone, $patPhone, $phoneDigits);
        mysqli_stmt_execute($ppStmt);
        $ppRes = mysqli_stmt_get_result($ppStmt);
        if ($ppRow = mysqli_fetch_assoc($ppRes)) {
            $pkgPrice = (float)($ppRow['price'] > 0 ? $ppRow['price'] : ($ppRow['pkg_price'] ?? 5000.00));
            $pkgDuration = !empty($ppRow['pkg_duration']) ? $ppRow['pkg_duration'] : '4 Weeks';
            $pkgDesc = !empty($ppRow['short_description']) ? $ppRow['short_description'] : 'Comprehensive holistic wellness and lifestyle protocol.';
            $docName = !empty($ppRow['doctor_name']) && $ppRow['doctor_name'] !== '0' ? $ppRow['doctor_name'] : (!empty($ppRow['assigned_doctor']) ? $ppRow['assigned_doctor'] : 'Dr. Nidhi Jha');

            $activePackage = [
                'id' => (int)$ppRow['id'],
                'booking_id' => $ppRow['booking_id'] ?: ('#PKG' . str_pad($ppRow['id'], 5, '0', STR_PAD_LEFT)),
                'title' => $ppRow['package_name'],
                'description' => $pkgDesc,
                'price' => $pkgPrice,
                'price_formatted' => '₹' . number_format($pkgPrice, 0) . ' / month',
                'duration' => $pkgDuration,
                'doctor_name' => $docName,
                'status' => $ppRow['status'] ?: 'Active',
                'booking_date' => !empty($ppRow['booking_date']) ? date('j M Y', strtotime($ppRow['booking_date'])) : date('j M Y')
            ];
        }
        mysqli_stmt_close($ppStmt);
    }

    // B. If not in patient_packages, check if patient record has a subscribed package_name
    if (!$activePackage && !empty($patient['package_name']) && strtolower(trim($patient['package_name'])) !== 'none' && strtolower(trim($patient['package_name'])) !== 'null') {
        $pName = trim($patient['package_name']);
        $pClean = trim(preg_replace('/\s*-\s*consultation/i', '', $pName));
        $pQuery = "SELECT * FROM packages WHERE package_name = ? OR package_name LIKE ? LIMIT 1";
        if ($pStmt = mysqli_prepare($connection1, $pQuery)) {
            $pLike = '%' . $pClean . '%';
            mysqli_stmt_bind_param($pStmt, "ss", $pName, $pLike);
            mysqli_stmt_execute($pStmt);
            $pRes = mysqli_stmt_get_result($pStmt);
            if ($pRow = mysqli_fetch_assoc($pRes)) {
                $pkgPrice = (float)($pRow['price'] ?? 5000.00);
                $activePackage = [
                    'id' => (int)$pRow['id'],
                    'booking_id' => '#PKG' . str_pad($pRow['id'], 5, '0', STR_PAD_LEFT),
                    'title' => $pRow['package_name'],
                    'description' => !empty($pRow['short_description']) ? $pRow['short_description'] : 'Personalized Ayurvedic health program.',
                    'price' => $pkgPrice,
                    'price_formatted' => '₹' . number_format($pkgPrice, 0) . ' / month',
                    'duration' => !empty($pRow['duration']) ? $pRow['duration'] : '4 Weeks',
                    'doctor_name' => !empty($pRow['assigned_doctor']) ? $pRow['assigned_doctor'] : 'Dr. Nidhi Jha',
                    'status' => 'Active',
                    'booking_date' => !empty($patient['created_at']) ? date('j M Y', strtotime($patient['created_at'])) : date('j M Y')
                ];
            }
            mysqli_stmt_close($pStmt);
        }
    }
}

// --------------------------------------------------------------------------
// 4. Dynamically Fetch All Successful Payment Records from Database Schema
// --------------------------------------------------------------------------
$payments = [];

if ($connection1) {
    // ----------------------------------------------------------------------
    // 4A. Query `patient_packages` (Package Subscriptions & Enrollments)
    // ----------------------------------------------------------------------
    $ppBookQuery = "SELECT pp.*, p.short_description, p.duration as pkg_duration, p.price as pkg_price, 
                           p.assigned_doctor, p.category
                    FROM patient_packages pp
                    LEFT JOIN packages p ON (p.id = pp.package_id OR p.package_name = pp.package_name COLLATE utf8mb4_unicode_ci)
                    WHERE ((pp.patient_id > 0 AND pp.patient_id = ?) 
                       OR (pp.patient_phone != '' AND (? != '' AND (pp.patient_phone = ? OR pp.patient_phone = ?))))
                    ORDER BY pp.id DESC";

    if ($ppStmt = mysqli_prepare($connection1, $ppBookQuery)) {
        mysqli_stmt_bind_param($ppStmt, "isss", $patDbId, $patPhone, $patPhone, $phoneDigits);
        mysqli_stmt_execute($ppStmt);
        $ppRes = mysqli_stmt_get_result($ppStmt);
        while ($ppRow = mysqli_fetch_assoc($ppRes)) {
            $pkgPrice = (float)($ppRow['price'] > 0 ? $ppRow['price'] : ($ppRow['pkg_price'] ?? 5000.00));
            $pkgTitle = $ppRow['package_name'] ?: 'Ayurveda Wellness Package';
            $rawDate = !empty($ppRow['booking_date']) ? $ppRow['booking_date'] : $ppRow['created_at'];
            $formattedDate = date('j M Y', strtotime($rawDate));
            $docName = !empty($ppRow['doctor_name']) && $ppRow['doctor_name'] !== '0' ? $ppRow['doctor_name'] : (!empty($ppRow['assigned_doctor']) ? $ppRow['assigned_doctor'] : 'Dr. Nidhi Jha');
            $duration = !empty($ppRow['pkg_duration']) ? $ppRow['pkg_duration'] : '4 Weeks';
            $bookingCode = $ppRow['booking_id'] ?: ('#PKG' . str_pad($ppRow['id'], 5, '0', STR_PAD_LEFT));
            $receiptCode = 'PKG-RCP-' . str_pad($ppRow['id'], 3, '0', STR_PAD_LEFT);

            $payments[] = [
                'id' => 2000 + (int)$ppRow['id'],
                'billing_id' => $bookingCode,
                'receipt_no' => $receiptCode,
                'date' => $formattedDate,
                'raw_date' => $rawDate,
                'time' => '10:00 AM',
                'duration' => $duration,
                'doctor_name' => $docName,
                'package_name' => $pkgTitle,
                'service_type' => 'Ayurveda Wellness Program',
                'patient_name' => $patName,
                'patient_gender' => $patGender,
                'patient_age' => $patAge . ' years',
                'subtotal' => '₹' . number_format($pkgPrice, 0),
                'discount' => '₹0',
                'total' => '₹' . number_format($pkgPrice, 0),
                'amount_raw' => $pkgPrice,
                'amount_words' => numberToWordsIndian($pkgPrice),
                'payment_status' => 'Success',
                'payment_method' => 'Card / Online',
                'items' => [
                    [
                        's_no' => '01',
                        'service' => "{$pkgTitle} (Package Enrollment)",
                        'qty' => '01',
                        'amount' => '₹' . number_format($pkgPrice, 0),
                        'discount' => '0',
                        'total' => '₹' . number_format($pkgPrice, 0)
                    ]
                ]
            ];
        }
        mysqli_stmt_close($ppStmt);
    }

    // ----------------------------------------------------------------------
    // 4B. Query `appointments` (Paid Doctor Consultations)
    // ----------------------------------------------------------------------
    $apptQuery = "SELECT a.*, p.price as pkg_price, p.duration as pkg_duration 
                  FROM appointments a 
                  LEFT JOIN packages p ON (a.package_name = p.package_name OR p.package_name LIKE CONCAT('%', a.package_name, '%'))
                  WHERE ((a.patient_id > 0 AND a.patient_id = ?) 
                     OR (a.patient_name != '' AND ? != '' AND a.patient_name = ?)
                     OR (? != '' AND a.patient_id IN (SELECT id FROM patients WHERE phone_number = ? OR phone_number = ?)))
                    AND a.status IN ('Scheduled', 'Upcoming', 'Completed', 'Active')
                  ORDER BY a.appointment_date DESC, a.id DESC";

    if ($aStmt = mysqli_prepare($connection1, $apptQuery)) {
        mysqli_stmt_bind_param($aStmt, "isssss", $patDbId, $patName, $patName, $patPhone, $patPhone, $phoneDigits);
        mysqli_stmt_execute($aStmt);
        $apptRes = mysqli_stmt_get_result($aStmt);
        while ($row = mysqli_fetch_assoc($apptRes)) {
            $appointmentCode = !empty($row['appointment_id']) ? $row['appointment_id'] : ('ABC-' . str_pad($row['id'], 3, '0', STR_PAD_LEFT));
            
            // Format Date
            $rawDate = $row['appointment_date'];
            $ts = strtotime($rawDate);
            $formattedDate = $ts !== false ? date('j M Y', $ts) : date('j M Y');
            
            // Format Time
            $timeDisplay = !empty($row['appointment_time']) ? $row['appointment_time'] : '9:30 AM';
            if (strpos($timeDisplay, '-') !== false) {
                $parts = explode('-', $timeDisplay);
                $timeDisplay = trim($parts[0]);
            }

            // Duration
            $durationDisplay = !empty($row['duration']) ? $row['duration'] : (!empty($row['pkg_duration']) ? $row['pkg_duration'] : '45 mins');
            if (is_numeric($durationDisplay)) {
                $durationDisplay = $durationDisplay . ' mins';
            }

            $doctorName = !empty($row['doctor_name']) ? $row['doctor_name'] : 'Dr. Nidhi Jha';
            $packageName = !empty($row['package_name']) ? $row['package_name'] : 'Ayurvedic Consultation';
            $serviceType = !empty($row['service_type']) ? $row['service_type'] : $packageName;
            $recPatientName = !empty($row['patient_name']) ? $row['patient_name'] : $patName;

            // Fee
            $basePrice = !empty($row['pkg_price']) && (float)$row['pkg_price'] > 0 ? (float)$row['pkg_price'] : 500.00;
            $discount = 0.00;
            if ($basePrice >= 5000) {
                $discount = 500.00;
            }
            $totalAmount = max(0, $basePrice - $discount);

            $items = [
                [
                    's_no' => '01',
                    'service' => $serviceType,
                    'qty' => '01',
                    'amount' => '₹' . number_format($basePrice, 0),
                    'discount' => $discount > 0 ? '₹' . number_format($discount, 0) : '0',
                    'total' => '₹' . number_format($totalAmount, 0)
                ]
            ];

            $payments[] = [
                'id' => (int)$row['id'],
                'billing_id' => $appointmentCode,
                'receipt_no' => 'EK-' . str_pad($row['id'], 3, '0', STR_PAD_LEFT),
                'date' => $formattedDate,
                'raw_date' => $rawDate,
                'time' => $timeDisplay,
                'duration' => $durationDisplay,
                'doctor_name' => $doctorName,
                'package_name' => $packageName,
                'service_type' => $serviceType,
                'patient_name' => $recPatientName,
                'patient_gender' => $patGender,
                'patient_age' => $patAge . ' years',
                'subtotal' => '₹' . number_format($basePrice, 0),
                'discount' => '₹' . number_format($discount, 0),
                'total' => '₹' . number_format($totalAmount, 0),
                'amount_raw' => $totalAmount,
                'amount_words' => numberToWordsIndian($totalAmount),
                'payment_status' => 'Success',
                'payment_method' => 'Card',
                'items' => $items
            ];
        }
        mysqli_stmt_close($aStmt);
    }

    // ----------------------------------------------------------------------
    // 4C. Query `workshop_bookings` (Paid Workshop Enrollments)
    // ----------------------------------------------------------------------
    $wsBookQuery = "SELECT wb.*, w.title as workshop_title, w.time as workshop_time, w.date as workshop_date,
                           w.speaker as ws_speaker, w.assign_speaker as ws_assign_speaker, 
                           w.instructor as ws_instructor
                    FROM workshop_bookings wb 
                    LEFT JOIN workshops w ON (wb.workshop_id = w.id OR wb.workshop_id = w.workshop_id) 
                    WHERE wb.payment_status = 'Success' 
                      AND (
                        (wb.doctor_phone != '' AND ? != '' AND (wb.doctor_phone = ? OR wb.doctor_phone = ?)) OR 
                        (wb.doctor_email != '' AND ? != '' AND wb.doctor_email = ?) OR 
                        (wb.doctor_name != '' AND ? != '' AND wb.doctor_name = ?) OR
                        (? = '' AND ? = '' AND wb.doctor_id = ? AND ? > 0)
                      )
                    ORDER BY wb.booking_date DESC";

    if ($wStmt = mysqli_prepare($connection1, $wsBookQuery)) {
        mysqli_stmt_bind_param($wStmt, "sssssssssii", 
            $patPhone, $patPhone, $phoneDigits,
            $patient['email'], $patient['email'],
            $patName, $patName,
            $patPhone, $patient['email'],
            $patDbId, $patDbId
        );
        mysqli_stmt_execute($wStmt);
        $wsRes = mysqli_stmt_get_result($wStmt);
        while ($wsRow = mysqli_fetch_assoc($wsRes)) {
            $wsAmount = (float)($wsRow['amount'] ?? 799.00);
            $wsTitle = !empty($wsRow['workshop_title']) ? $wsRow['workshop_title'] : 'Ayurveda Workshop';
            $wsDate = !empty($wsRow['booking_date']) ? date('j M Y', strtotime($wsRow['booking_date'])) : (!empty($wsRow['ws_date']) ? date('j M Y', strtotime($wsRow['ws_date'])) : date('j M Y'));
            $wsTime = !empty($wsRow['workshop_time']) ? $wsRow['workshop_time'] : '8:00 AM';
            $speaker = !empty($wsRow['ws_speaker']) ? $wsRow['ws_speaker'] : (!empty($wsRow['ws_assign_speaker']) ? $wsRow['ws_assign_speaker'] : (!empty($wsRow['ws_instructor']) ? $wsRow['ws_instructor'] : 'Dr. Nidhi Jha'));
            $duration = !empty($wsRow['ws_duration']) ? $wsRow['ws_duration'] : 'Workshop Session';

            $payments[] = [
                'id' => 1000 + (int)$wsRow['id'],
                'billing_id' => $wsRow['booking_id'] ?: ('WS-' . str_pad($wsRow['id'], 3, '0', STR_PAD_LEFT)),
                'receipt_no' => 'WS-RCP-' . str_pad($wsRow['id'], 3, '0', STR_PAD_LEFT),
                'date' => $wsDate,
                'raw_date' => $wsRow['booking_date'],
                'time' => $wsTime,
                'duration' => $duration,
                'doctor_name' => $speaker,
                'package_name' => $wsTitle,
                'service_type' => 'Interactive Workshop',
                'patient_name' => !empty($wsRow['doctor_name']) ? $wsRow['doctor_name'] : $patName,
                'patient_gender' => $patGender,
                'patient_age' => $patAge . ' years',
                'subtotal' => '₹' . number_format($wsAmount, 0),
                'discount' => '₹0',
                'total' => '₹' . number_format($wsAmount, 0),
                'amount_raw' => $wsAmount,
                'amount_words' => numberToWordsIndian($wsAmount),
                'payment_status' => 'Success',
                'payment_method' => ucfirst($wsRow['payment_method'] ?: 'Card'),
                'items' => [
                    [
                        's_no' => '01',
                        'service' => $wsTitle,
                        'qty' => '01',
                        'amount' => '₹' . number_format($wsAmount, 0),
                        'discount' => '0',
                        'total' => '₹' . number_format($wsAmount, 0)
                    ]
                ]
            ];
        }
        mysqli_stmt_close($wStmt);
    }
}

// Ensure results are sorted by date descending
usort($payments, function($a, $b) {
    return strtotime($b['raw_date']) - strtotime($a['raw_date']);
});

sendJsonResponse(true, 'Billing payment records retrieved successfully from database.', [
    'patient' => [
        'id' => $patDbId,
        'patient_id' => $patient['patient_id'] ?? 'P001',
        'name' => $patName,
        'gender' => $patGender,
        'age' => $patAge
    ],
    'active_package' => $activePackage,
    'total_count' => count($payments),
    'payments' => $payments
]);
