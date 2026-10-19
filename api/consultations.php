<?php
/**
 * Ocayur Patient Portal - Consultations Backend API
 * Handles appointment listing and consultation bookings.
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

function sendJsonResponse($success, $message, $data = [], $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode(array_merge([
        'success' => $success,
        'message' => $message,
        'timestamp' => date('Y-m-d H:i:s')
    ], $data));
    exit;
}

function parseAppointmentTimestamp($dateStr, $timeStr) {
    if (empty($dateStr)) {
        return false;
    }
    $timeStr = trim((string)$timeStr);
    if (empty($timeStr)) {
        return strtotime($dateStr . ' 23:59:59');
    }

    $parts = explode('-', $timeStr);
    $startTime = trim($parts[0]);

    if (!preg_match('/(am|pm)/i', $startTime)) {
        if (preg_match('/(am|pm)/i', $timeStr, $matches)) {
            $startTime .= ' ' . strtoupper($matches[1]);
        }
    }

    $combined = $dateStr . ' ' . $startTime;
    $ts = strtotime($combined);
    if ($ts === false) {
        $ts = strtotime($dateStr . ' 23:59:59');
    }
    return $ts;
}

function resolvePrescriptionPayload($appt, $patientsMap, $doctorsMap, $prescByAppt, $prescByPatient, $defaultPrescription) {
    $patientId = (int)($appt['patient_id'] ?? 0);
    $patientName = trim($appt['patient_name'] ?? '');
    $doctorId = (int)($appt['doctor_id'] ?? 0);
    $doctorName = trim($appt['doctor_name'] ?? '');

    $pRow = $patientsMap[$patientId] ?? null;
    if (!$pRow && !empty($patientName)) {
        foreach ($patientsMap as $p) {
            if (strcasecmp($p['full_name'], $patientName) === 0 || stripos($p['full_name'], $patientName) !== false) {
                $pRow = $p;
                break;
            }
        }
    }

    $dRow = $doctorsMap[$doctorId] ?? null;
    if (!$dRow && !empty($doctorName)) {
        $cleanDoc = trim(str_ireplace(['Dr.', 'Dr '], '', $doctorName));
        foreach ($doctorsMap as $d) {
            if (stripos($d['full_name'], $cleanDoc) !== false) {
                $dRow = $d;
                break;
            }
        }
    }

    $prescRow = $prescByAppt[(int)($appt['id'] ?? 0)] ?? null;
    if (!$prescRow && $patientId > 0) {
        $prescRow = $prescByPatient[$patientId] ?? null;
    }
    if (!$prescRow && !empty($patientName)) {
        foreach ($prescByPatient as $pr) {
            if (strcasecmp($pr['patient_name'], $patientName) === 0 || stripos($pr['patient_name'], $patientName) !== false) {
                $prescRow = $pr;
                break;
            }
        }
    }
    if (!$prescRow) {
        $prescRow = $defaultPrescription;
    }

    $rawApptPresc = trim($appt['prescription'] ?? '');
    $parsedApptPresc = null;
    if (!empty($rawApptPresc) && $rawApptPresc[0] === '{') {
        $parsedApptPresc = json_decode($rawApptPresc, true);
    }

    $resolvedPatientName = !empty($patientName) ? $patientName : ($pRow['full_name'] ?? ($prescRow['patient_name'] ?? ($_SESSION['full_name'] ?? 'Patient')));
    $resolvedGender = $pRow['gender'] ?? ($parsedApptPresc['gender'] ?? '--');
    $resolvedAge = !empty($pRow['age']) ? (int)$pRow['age'] : (!empty($parsedApptPresc['age']) ? (int)$parsedApptPresc['age'] : '--');

    $resolvedDate = !empty($appt['appointment_date']) ? $appt['appointment_date'] : ($prescRow['prescription_date'] ?? date('Y-m-d'));
    $resolvedTime = !empty($appt['appointment_time']) ? $appt['appointment_time'] : ($prescRow['prescription_time'] ?? '11:20 AM');

    $resolvedMedHistory = $prescRow['medical_history'] ?? ($parsedApptPresc['medical_history'] ?? 'No Known Significant Medical History');

    $resolvedSymptoms = $prescRow['symptoms'] ?? ($parsedApptPresc['symptoms'] ?? 'Constipation (Severity : Moderate)');
    if (is_array($resolvedSymptoms)) {
        $sympStr = '';
        foreach ($resolvedSymptoms as $s) {
            $sympStr .= (is_array($s) ? ($s['symptom'] . (!empty($s['severity']) ? " (Severity : {$s['severity']})" : '')) : $s) . ', ';
        }
        $resolvedSymptoms = rtrim($sympStr, ', ');
    } elseif (is_string($resolvedSymptoms) && $resolvedSymptoms !== '' && $resolvedSymptoms[0] === '[') {
        $decoded = json_decode($resolvedSymptoms, true);
        if (is_array($decoded)) {
            $sympStr = '';
            foreach ($decoded as $s) {
                $sympStr .= (is_array($s) ? ($s['symptom'] . (!empty($s['severity']) ? " (Severity : {$s['severity']})" : '')) : $s) . ', ';
            }
            $resolvedSymptoms = rtrim($sympStr, ', ');
        }
    }

    $diagVal = $prescRow['diagnosis'] ?? ($parsedApptPresc['diagnosis'] ?? 'Migraine');
    $diagDur = $prescRow['diagnosis_duration'] ?? ($parsedApptPresc['diagnosis_duration'] ?? '3 months');
    $resolvedDiagnosis = !empty($diagDur) ? "{$diagVal} (Duration : {$diagDur})" : $diagVal;

    $rawMeds = $prescRow['medications'] ?? ($parsedApptPresc['medications'] ?? null);
    $medicationsList = [];
    if (is_string($rawMeds) && $rawMeds !== '' && ($rawMeds[0] === '[' || $rawMeds[0] === '{')) {
        $medicationsList = json_decode($rawMeds, true);
    } elseif (is_array($rawMeds)) {
        $medicationsList = $rawMeds;
    }

    if (empty($medicationsList)) {
        $medName = !empty($rawApptPresc) && $rawApptPresc[0] !== '{' ? $rawApptPresc : 'NULL';
        $medicationsList = [
            [
                'medication' => $medName,
                'dose' => '1 TABLET',
                'frequency' => '1-0-1 BEFORE MEAL',
                'duration' => '10 DAYS',
                'remarks' => 'TAKE 1 TABLET - TWICE A DAY, BEFORE BREAKFAST AND BEFORE DINNER FOR 10 DAYS'
            ]
        ];
    }

    $resolvedFindings = $prescRow['examination_findings'] ?? ($parsedApptPresc['examination_findings'] ?? 'Abdomen Feels Distended');
    $resolvedNotes = !empty($appt['notes']) ? $appt['notes'] : ($prescRow['notes'] ?? ($parsedApptPresc['notes'] ?? 'Gandhush ( Cow Ghee + Triphala Powder )'));

    $referralDoc = $prescRow['doctor_name'] ?? ($parsedApptPresc['doctor_name'] ?? (!empty($doctorName) ? $doctorName : 'Dr. Ananya Prasad'));
    $referralSpec = $prescRow['doctor_specialty'] ?? ($parsedApptPresc['doctor_specialty'] ?? ($dRow['expertise'] ?? 'Ayurvedic Medicine'));
    $referralPhone = $prescRow['doctor_phone'] ?? ($dRow['phone_number'] ?? '+91 7896543210');
    $referralEmail = $prescRow['doctor_email'] ?? ($dRow['email'] ?? 'care@ocayur.com');

    return [
        'appointment_id' => $appt['appointment_id'] ?? ('APT-' . ($appt['id'] ?? 1)),
        'appointment_db_id' => (int)($appt['id'] ?? 0),
        'date' => $resolvedDate,
        'time' => $resolvedTime,
        'patient_name' => $resolvedPatientName,
        'gender' => $resolvedGender,
        'age' => $resolvedAge,
        'medical_history' => $resolvedMedHistory,
        'symptoms' => $resolvedSymptoms,
        'diagnosis' => $resolvedDiagnosis,
        'diagnosis_name' => $diagVal,
        'diagnosis_duration' => $diagDur,
        'medications' => $medicationsList,
        'examination_findings' => $resolvedFindings,
        'notes' => $resolvedNotes,
        'referred_doctor' => $referralDoc,
        'referred_specialty' => $referralSpec,
        'support_phone' => $referralPhone,
        'support_email' => $referralEmail,
        'prescription_code' => $prescRow['prescription_code'] ?? 'RX-001'
    ];
}

// 1. GET REQUESTS
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $action = isset($_GET['action']) ? trim($_GET['action']) : 'my_appointments';

    // 1.1 Action: List Doctors
    if ($action === 'doctors') {
        $query = "SELECT id, doctorid, full_name, expertise, area, years_of_experience, status FROM doctors WHERE status = 'Active' ORDER BY id ASC";
        $result = mysqli_query($connection1, $query);
        $doctors = [];
        if ($result) {
            while ($row = mysqli_fetch_assoc($result)) {
                $doctors[] = [
                    'id' => (int)$row['id'],
                    'doctorid' => $row['doctorid'],
                    'name' => $row['full_name'],
                    'role' => !empty($row['area']) ? "{$row['expertise']} ({$row['area']})" : $row['expertise']
                ];
            }
        }
        sendJsonResponse(true, 'Doctors loaded successfully', ['doctors' => $doctors]);
    }

    // Pre-load reference maps from DB
    $patientsMap = [];
    $pRes = mysqli_query($connection1, "SELECT * FROM patients");
    if ($pRes) {
        while ($p = mysqli_fetch_assoc($pRes)) {
            $patientsMap[(int)$p['id']] = $p;
        }
    }

    $doctorsMap = [];
    $dRes = mysqli_query($connection1, "SELECT * FROM doctors");
    if ($dRes) {
        while ($d = mysqli_fetch_assoc($dRes)) {
            $doctorsMap[(int)$d['id']] = $d;
        }
    }

    $prescByAppt = [];
    $prescByPatient = [];
    $defaultPrescription = null;
    $prRes = mysqli_query($connection1, "SELECT * FROM prescriptions ORDER BY id ASC");
    if ($prRes) {
        while ($pr = mysqli_fetch_assoc($prRes)) {
            if (!$defaultPrescription) {
                $defaultPrescription = $pr;
            }
            if (!empty($pr['appointment_id'])) {
                $prescByAppt[(int)$pr['appointment_id']] = $pr;
            }
            if (!empty($pr['patient_id'])) {
                $prescByPatient[(int)$pr['patient_id']] = $pr;
            }
        }
    }

    // 1.2 Action: Single Prescription Fetch
    if ($action === 'prescription') {
        $targetId = isset($_GET['appointment_id']) ? (int)$_GET['appointment_id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);
        $targetCode = isset($_GET['code']) ? trim($_GET['code']) : '';
        $targetAppt = null;

        if ($targetId > 0) {
            $aq = mysqli_query($connection1, "SELECT * FROM appointments WHERE id = {$targetId} LIMIT 1");
            if ($aq && mysqli_num_rows($aq) > 0) {
                $targetAppt = mysqli_fetch_assoc($aq);
            }
        } elseif (!empty($targetCode)) {
            $cSafe = mysqli_real_escape_string($connection1, $targetCode);
            $aq = mysqli_query($connection1, "SELECT * FROM appointments WHERE appointment_id = '{$cSafe}' LIMIT 1");
            if ($aq && mysqli_num_rows($aq) > 0) {
                $targetAppt = mysqli_fetch_assoc($aq);
            }
        }

        if (!$targetAppt && $targetId > 0) {
            $targetAppt = ['id' => $targetId];
        }

        $prescData = resolvePrescriptionPayload($targetAppt, $patientsMap, $doctorsMap, $prescByAppt, $prescByPatient, $defaultPrescription);
        sendJsonResponse(true, 'Prescription loaded successfully', ['prescription' => $prescData]);
    }

    // 1.3 Action: List Appointments (My Appointments & History)
    $apptsQuery = "SELECT a.*, d.expertise, d.area, d.doctorid AS doctor_code, p.gender, p.age, p.phone_number AS patient_phone, p.email AS patient_email FROM appointments a LEFT JOIN doctors d ON a.doctor_id = d.id LEFT JOIN patients p ON (a.patient_id = p.id OR a.patient_name = p.full_name) ORDER BY a.appointment_date DESC, a.id DESC";
    $apptsRes = mysqli_query($connection1, $apptsQuery);
    $myAppointments = [];
    $historyAppointments = [];
    $allAppointments = [];
    $now = time();

    if ($apptsRes) {
        while ($r = mysqli_fetch_assoc($apptsRes)) {
            $rawDate = $r['appointment_date'];
            $rawTime = $r['appointment_time'];

            $ts = parseAppointmentTimestamp($rawDate, $rawTime);
            $isUpcoming = ($ts !== false && $ts > $now);

            $apptId = !empty($r['appointment_id']) ? $r['appointment_id'] : ('APT-' . $r['id']);
            $docName = !empty($r['doctor_name']) ? $r['doctor_name'] : 'Dr. Nidhi Jha';
            $cleanDoc = strtolower(preg_replace('/[^a-z0-9]/i', '', str_replace(['Dr.', 'Dr '], '', $docName)));
            $meetLink = "https://meet.google.com/abc-{$cleanDoc}-ocayur";

            $prescPayload = resolvePrescriptionPayload($r, $patientsMap, $doctorsMap, $prescByAppt, $prescByPatient, $defaultPrescription);

            $item = [
                'id' => (int)$r['id'],
                'appointment_id' => $apptId,
                'patient_id' => $r['patient_id'],
                'patient_name' => $r['patient_name'],
                'gender' => $r['gender'] ?? ($prescPayload['gender'] ?? 'Male'),
                'age' => $r['age'] ?? ($prescPayload['age'] ?? 34),
                'doctor_id' => $r['doctor_id'],
                'doctor_name' => $docName,
                'package_name' => $r['package_name'],
                'appointment_date' => $r['appointment_date'],
                'appointment_time' => $r['appointment_time'],
                'duration' => !empty($r['duration']) ? $r['duration'] : '45 min',
                'service_type' => $r['service_type'],
                'agenda' => !empty($r['agenda']) ? $r['agenda'] : 'Ayurvedic consultation and pulse diagnostics review',
                'prescription' => $r['prescription'],
                'prescription_data' => $prescPayload,
                'status' => $r['status'],
                'notes' => $r['notes'],
                'expertise' => $r['expertise'],
                'area' => $r['area'],
                'role' => !empty($r['area']) ? "{$r['expertise']} ({$r['area']})" : $r['expertise'],
                'meet_link' => $meetLink,
                'is_upcoming' => $isUpcoming,
                'timestamp' => $ts
            ];

            $allAppointments[] = $item;

            if ($isUpcoming) {
                $myAppointments[] = $item;
            } else {
                $historyAppointments[] = $item;
            }
        }
    }

    sendJsonResponse(true, 'Appointments retrieved successfully', [
        'my_appointments' => $myAppointments,
        'history_appointments' => $historyAppointments,
        'appointments' => ($action === 'history' ? $historyAppointments : $myAppointments),
        'all_appointments' => $allAppointments
    ]);
}

// 2. POST REQUESTS: Book Consultation Appointment
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
if (!$data || !is_array($data)) {
    $data = $_POST;
}

$doctorName = isset($data['doctor_name']) ? trim($data['doctor_name']) : (isset($data['doctorName']) ? trim($data['doctorName']) : 'Dr. Nidhi Jha');
$doctorRole = isset($data['doctor_role']) ? trim($data['doctor_role']) : (isset($data['doctorRole']) ? trim($data['doctorRole']) : 'Ayurveda Physician');
$patientName = !empty($data['patient_name']) ? trim($data['patient_name']) : (!empty($data['patientName']) ? trim($data['patientName']) : ($_SESSION['full_name'] ?? 'Patient'));
$patientEmail = !empty($data['patient_email']) ? trim($data['patient_email']) : (!empty($data['patientEmail']) ? trim($data['patientEmail']) : ($_SESSION['email'] ?? ''));
$patientPhone = !empty($data['patient_phone']) ? trim($data['patient_phone']) : (!empty($data['patientPhone']) ? trim($data['patientPhone']) : ($_SESSION['phone_number'] ?? ''));
$appointmentDateRaw = isset($data['appointment_date']) ? trim($data['appointment_date']) : (isset($data['date']) ? trim($data['date']) : date('Y-m-d'));
$appointmentTime = isset($data['appointment_time']) ? trim($data['appointment_time']) : (isset($data['time']) ? trim($data['time']) : '07:00 - 07:45 PM');
$duration = isset($data['duration']) ? trim($data['duration']) : '45 min';
$agenda = isset($data['complaint']) && !empty(trim($data['complaint'])) ? trim($data['complaint']) : (isset($data['agenda']) ? trim($data['agenda']) : "Ayurvedic consultation with {$doctorName}");
$amount = isset($data['amount']) ? (float)$data['amount'] : 500.00;

// Resolve Date
$appointmentDate = date('Y-m-d');
if (!empty($appointmentDateRaw)) {
    $parsed = strtotime($appointmentDateRaw);
    if ($parsed !== false) {
        $appointmentDate = date('Y-m-d', $parsed);
    }
}

// Resolve Doctor DB ID
$doctorDbId = 1;
$dStmt = mysqli_prepare($connection1, "SELECT id FROM doctors WHERE full_name = ? OR full_name LIKE ? LIMIT 1");
if ($dStmt) {
    $docLike = '%' . $doctorName . '%';
    mysqli_stmt_bind_param($dStmt, "ss", $doctorName, $docLike);
    mysqli_stmt_execute($dStmt);
    $dRes = mysqli_stmt_get_result($dStmt);
    if ($dRow = mysqli_fetch_assoc($dRes)) {
        $doctorDbId = (int)$dRow['id'];
    }
    mysqli_stmt_close($dStmt);
}

// Resolve Patient DB ID
$patientDbId = 1;
$pStmt = mysqli_prepare($connection1, "SELECT id, patient_id FROM patients WHERE (phone_number != '' AND phone_number = ?) OR (email != '' AND email = ?) LIMIT 1");
if ($pStmt) {
    mysqli_stmt_bind_param($pStmt, "ss", $patientPhone, $patientEmail);
    mysqli_stmt_execute($pStmt);
    $pRes = mysqli_stmt_get_result($pStmt);
    if ($pRow = mysqli_fetch_assoc($pRes)) {
        $patientDbId = (int)$pRow['id'];
        mysqli_query($connection1, "UPDATE patients SET total_appointments = total_appointments + 1, updated_at = NOW() WHERE id = {$patientDbId}");
    }
    mysqli_stmt_close($pStmt);
}

// Generate unique Appointment ID
$appointmentCode = 'APT-' . date('Ymd') . '-' . rand(100, 999);
$bookingIdNumber = rand(100000, 999999);

$insertQuery = "INSERT INTO appointments (appointment_id, patient_id, patient_name, doctor_id, doctor_name, package_name, appointment_date, appointment_time, duration, service_type, agenda, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'General Consultation', ?, ?, ?, 'Online Ayurved Consultation', ?, 'Scheduled', NOW(), NOW())";
if ($inStmt = mysqli_prepare($connection1, $insertQuery)) {
    mysqli_stmt_bind_param($inStmt, "sisisssss", $appointmentCode, $patientDbId, $patientName, $doctorDbId, $doctorName, $appointmentDate, $appointmentTime, $duration, $agenda);
    mysqli_stmt_execute($inStmt);
    mysqli_stmt_close($inStmt);
}

sendJsonResponse(true, 'Consultation appointment booked successfully!', [
    'booking_id' => '#' . $bookingIdNumber,
    'appointment_id' => $appointmentCode,
    'doctor_name' => $doctorName,
    'doctor_role' => $doctorRole,
    'patient_name' => $patientName,
    'date' => $appointmentDateRaw,
    'time' => $appointmentTime,
    'amount' => '₹' . number_format($amount, 2),
    'status' => 'Scheduled'
]);
