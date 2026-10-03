<?php
/**
 * Panchved Patient Portal - Doctors Backend API
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

$query = "SELECT id, doctorid, full_name, expertise, area, years_of_experience, status FROM doctors WHERE status = 'Active' ORDER BY id ASC";
$result = mysqli_query($connection1, $query);
$doctors = [];

if ($result) {
    while ($row = mysqli_fetch_assoc($result)) {
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

        $doctors[] = [
            'id' => (int)$row['id'],
            'doctorid' => $row['doctorid'] ?? '',
            'name' => $fullName,
            'full_name' => $fullName,
            'expertise' => $expertise,
            'area' => $area,
            'role' => $role,
            'experience' => (int)($row['years_of_experience'] ?? 0),
            'initials' => $initials,
            'status' => $row['status'] ?? 'Active'
        ];
    }
}

echo json_encode([
    'success' => true,
    'message' => 'Active doctors fetched successfully from database.',
    'count' => count($doctors),
    'doctors' => $doctors
]);
