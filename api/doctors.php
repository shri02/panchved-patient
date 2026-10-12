<?php
/**
 * Ocayur Patient Portal - Doctors Backend API
 * Fetches active doctors directly from MySQL `doctors` table schema.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/database.php';

// Doctor Schedule & Availability Mapping (in minutes from midnight)
$doctorSchedules = [
    1 => [ // Dr. Nidhi Jha: 08:00 AM - 01:00 PM, 05:00 PM - 09:00 PM
        ['start' => '08:00 AM', 'end' => '01:00 PM', 'start_min' => 480, 'end_min' => 780],
        ['start' => '05:00 PM', 'end' => '09:00 PM', 'start_min' => 1020, 'end_min' => 1260],
    ],
    2 => [ // Dr. Rohit Mehra: 10:00 AM - 02:00 PM, 04:00 PM - 08:00 PM
        ['start' => '10:00 AM', 'end' => '02:00 PM', 'start_min' => 600, 'end_min' => 840],
        ['start' => '04:00 PM', 'end' => '08:00 PM', 'start_min' => 960, 'end_min' => 1200],
    ],
    3 => [ // Dr. Priya Patel: 08:00 AM - 02:00 PM, 06:00 PM - 09:00 PM
        ['start' => '08:00 AM', 'end' => '02:00 PM', 'start_min' => 480, 'end_min' => 840],
        ['start' => '06:00 PM', 'end' => '09:00 PM', 'start_min' => 1080, 'end_min' => 1260],
    ],
    4 => [ // Dr. Ankit Verma: 12:00 PM - 06:00 PM
        ['start' => '12:00 PM', 'end' => '06:00 PM', 'start_min' => 720, 'end_min' => 1080],
    ],
    5 => [ // Dr. Sneha Kulkarni: 03:00 PM - 09:00 PM
        ['start' => '03:00 PM', 'end' => '09:00 PM', 'start_min' => 900, 'end_min' => 1260],
    ]
];

$query = "SELECT id, doctorid, full_name, expertise, area, years_of_experience, status FROM doctors WHERE status = 'Active' ORDER BY id ASC";
$result = mysqli_query($connection1, $query);
$doctors = [];

if ($result) {
    while ($row = mysqli_fetch_assoc($result)) {
        $id = (int)$row['id'];
        $fullName = trim((string)$row['full_name']);
        $expertise = trim((string)($row['expertise'] ?? 'Ayurveda Physician'));
        $area = trim((string)($row['area'] ?? ''));
        $role = !empty($area) ? "{$expertise} ({$area})" : $expertise;

        // Initials calculation
        $cleanedDocName = preg_replace('/^(Dr\.|Dr)\s*/i', '', $fullName);
        $words = preg_split('/\s+/', trim($cleanedDocName));
        $initials = '';
        foreach ($words as $w) {
            if (!empty($w)) $initials .= strtoupper($w[0]);
        }
        $initials = substr($initials, 0, 2) ?: 'DR';

        $schedule = $doctorSchedules[$id] ?? [
            ['start' => '09:00 AM', 'end' => '07:00 PM', 'start_min' => 540, 'end_min' => 1140]
        ];

        $doctors[] = [
            'id' => $id,
            'doctorid' => $row['doctorid'] ?? '',
            'name' => $fullName,
            'full_name' => $fullName,
            'expertise' => $expertise,
            'area' => $area,
            'role' => $role,
            'experience' => (int)($row['years_of_experience'] ?? 0),
            'initials' => $initials,
            'status' => $row['status'] ?? 'Active',
            'schedule' => $schedule
        ];
    }
}

// Optional filter by requested start time
if (!empty($_GET['time'])) {
    $timeStr = trim($_GET['time']);
    if (preg_match('/^(\d{1,2}):(\d{2})\s*([APap][Mm])?$/i', $timeStr, $m)) {
        $hours = (int)$m[1];
        $minutes = (int)$m[2];
        $meridian = strtoupper($m[3] ?? '');
        if ($meridian === 'PM' && $hours < 12) $hours += 12;
        if ($meridian === 'AM' && $hours === 12) $hours = 0;
        $reqMins = $hours * 60 + $minutes;

        $doctors = array_values(array_filter($doctors, function($doc) use ($reqMins) {
            if (empty($doc['schedule'])) return true;
            foreach ($doc['schedule'] as $slot) {
                if ($reqMins >= $slot['start_min'] && $reqMins < $slot['end_min']) {
                    return true;
                }
            }
            return false;
        }));
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Active doctors fetched successfully from database.',
    'count' => count($doctors),
    'doctors' => $doctors
]);
