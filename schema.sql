-- ============================================================================
-- Ocayur Ayurveda Lifestyle
-- Comprehensive Database Schema SQL Script
-- Database: jewrzsmy_panchved / jcwrzsmy_panchved
-- ============================================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- ----------------------------------------------------------------------------
-- Table: users (Admin, Doctors & Staff Authentication)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL,
  `full_name` VARCHAR(150) DEFAULT 'Admin User',
  `email` VARCHAR(150) NOT NULL,
  `phone_number` VARCHAR(20) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL DEFAULT 'Admin',
  `avatar_url` VARCHAR(255) DEFAULT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `last_login` DATETIME DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_username` (`username`),
  UNIQUE KEY `idx_user_email` (`email`),
  UNIQUE KEY `idx_user_phone` (`phone_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Users (Password: admin123)
-- bcrypt hash for 'admin123': $2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm
INSERT INTO `users` (`id`, `username`, `full_name`, `email`, `phone_number`, `password_hash`, `role`, `status`) VALUES
(1, 'admin', 'John Doe', 'admin@ocayur.com', '9876543210', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'Admin', 'Active'),
(2, 'drnidhi', 'Dr. Nidhi Jha', 'drnidhi@gmail.com', '9876543211', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'Doctor', 'Active'),
(3, 'staff', 'Reception Desk', 'staff@ocayur.com', '9876543212', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'Staff', 'Active')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `password_hash` = VALUES(`password_hash`);


-- ----------------------------------------------------------------------------
-- Table: doctors
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `doctors` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `doctorid` VARCHAR(50) DEFAULT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `date_of_birth` DATE NOT NULL,
  `phone_number` VARCHAR(20) NOT NULL,
  `gender` ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male',
  `email` VARCHAR(150) NOT NULL,
  `years_of_experience` INT(11) NOT NULL DEFAULT 0,
  `expertise` VARCHAR(150) NOT NULL,
  `area` VARCHAR(150) NOT NULL,
  `registration_number` VARCHAR(100) NOT NULL,
  `hpr_registration_number` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_doctorid` (`doctorid`),
  UNIQUE KEY `idx_doc_email` (`email`),
  UNIQUE KEY `idx_doc_phone` (`phone_number`),
  UNIQUE KEY `idx_reg_number` (`registration_number`),
  KEY `idx_doc_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Doctors
INSERT INTO `doctors` (`id`, `doctorid`, `full_name`, `date_of_birth`, `phone_number`, `gender`, `email`, `years_of_experience`, `expertise`, `area`, `registration_number`, `hpr_registration_number`, `status`) VALUES
(1, 'DOC000001', 'Dr. Nidhi Jha', '1986-06-15', '9876543210', 'Female', 'drnidhi@gmail.com', 12, 'Ayurveda Physician', 'Pediatrics & Gynecology', 'AYU1234', 'HPR1234', 'Active'),
(2, 'DOC000002', 'Dr. Rohit Mehra', '1988-04-20', '9823456789', 'Male', 'rohitmehra@gmail.com', 10, 'Physiotherapist', 'Orthopedic & Sports Rehab', 'PHY5678', 'HPR5678', 'Active'),
(3, 'DOC000003', 'Dr. Priya Patel', '1990-11-12', '9811223344', 'Female', 'priyapatel@gmail.com', 8, 'Panchakarma Specialist', 'Detox & Rejuvenation', 'AYU9012', 'HPR9012', 'Active'),
(4, 'DOC000004', 'Dr. Ankit Verma', '1982-02-28', '9833445566', 'Male', 'ankitverma@gmail.com', 16, 'Ayurvedic Consultant', 'Chronic Disease Management', 'AYU3456', 'HPR3456', 'Active'),
(5, 'DOC000005', 'Dr. Sneha Kulkarni', '1992-09-05', '9877889900', 'Female', 'snehak@gmail.com', 6, 'Neuro-Physiotherapist', 'Neurological Rehab', 'PHY7890', 'HPR7890', 'Inactive')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `expertise` = VALUES(`expertise`);


-- ----------------------------------------------------------------------------
-- Table: patients
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `patients` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `patient_id` VARCHAR(50) DEFAULT NULL,
  `patient_profile` VARCHAR(45) DEFAULT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `dob` DATE DEFAULT NULL,
  `age` INT(11) NOT NULL DEFAULT 30,
  `height` VARCHAR(45) DEFAULT NULL,
  `weight` VARCHAR(45) DEFAULT NULL,
  `phone_number` VARCHAR(20) NOT NULL,
  `gender` ENUM('Male', 'Female', 'Other') NOT NULL DEFAULT 'Male',
  `email` VARCHAR(150) DEFAULT NULL,
  `blood_group` VARCHAR(10) DEFAULT 'O+',
  `emergency_contact` VARCHAR(20) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `package_name` VARCHAR(150) DEFAULT 'Stress Management',
  `total_appointments` INT(11) NOT NULL DEFAULT 0,
  `status` ENUM('Ongoing', 'Completed', 'Active', 'Inactive') NOT NULL DEFAULT 'Ongoing',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_patient_id` (`patient_id`),
  KEY `idx_patient_phone` (`phone_number`),
  KEY `idx_patient_name` (`full_name`),
  KEY `idx_patient_package` (`package_name`),
  KEY `idx_patient_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Patients
INSERT INTO `patients` (`id`, `patient_id`, `full_name`, `dob`, `age`, `phone_number`, `gender`, `email`, `package_name`, `total_appointments`, `status`) VALUES
(1, 'E001', 'Rahul Sharma', '1990-05-14', 34, '9876543210', 'Male', 'rahulsharma@gmail.com', 'Stresscare', 18, 'Ongoing'),
(2, 'E002', 'Pooja Deshmukh', '1996-08-22', 28, '9812345678', 'Female', 'poojad@gmail.com', 'Reset Your Hormones', 12, 'Ongoing'),
(3, 'E003', 'Vikram Malhotra', '1982-11-03', 42, '9823456781', 'Male', 'vikram.m@gmail.com', 'Gut Healing Package', 24, 'Completed'),
(4, 'E004', 'Ananya Sengupta', '1995-02-18', 29, '9834567892', 'Female', 'ananya.s@gmail.com', 'Work On Metabolism', 15, 'Ongoing'),
(5, 'E005', 'Suresh Iyer', '1974-09-30', 50, '9845678903', 'Male', 'sureshiyer@gmail.com', 'Stresscare', 20, 'Ongoing'),
(6, 'E006', 'Meera Nair', '1989-12-10', 35, '9856789014', 'Female', 'meera.nair@gmail.com', 'Reset Your Hormones', 8, 'Completed')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`), `package_name` = VALUES(`package_name`);


-- ----------------------------------------------------------------------------
-- Table: packages
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `packages` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `package_id` VARCHAR(50) DEFAULT NULL,
  `package_name` VARCHAR(150) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `assigned_doctor` VARCHAR(150) DEFAULT NULL,
  `duration` VARCHAR(50) NOT NULL DEFAULT '4 Weeks',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `enrollments` INT(11) NOT NULL DEFAULT 0,
  `protocol_status` VARCHAR(50) NOT NULL DEFAULT 'Added',
  `image_url` VARCHAR(255) DEFAULT 'assets/package-thumb.jpg',
  `short_description` TEXT DEFAULT NULL,
  `overview` TEXT DEFAULT NULL,
  `benefits` TEXT DEFAULT NULL,
  `included` TEXT DEFAULT NULL,
  `diet_hydration` TEXT DEFAULT NULL,
  `yoga_physio` TEXT DEFAULT NULL,
  `ayurveda_dinacharya` TEXT DEFAULT NULL,
  `daily_activity` TEXT DEFAULT NULL,
  `patient_monitoring` TEXT DEFAULT NULL,
  `followup_review` TEXT DEFAULT NULL,
  `status` ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_pkg_code` (`package_id`),
  KEY `idx_pkg_name` (`package_name`),
  KEY `idx_pkg_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Packages
INSERT INTO `packages` (`id`, `package_id`, `package_name`, `category`, `assigned_doctor`, `duration`, `price`, `enrollments`, `protocol_status`, `short_description`, `overview`, `benefits`, `included`, `diet_hydration`, `yoga_physio`, `ayurveda_dinacharya`, `daily_activity`, `patient_monitoring`, `followup_review`, `status`) VALUES
(1, 'PKG-001', 'Gut Reset Workshop', 'Category A', 'Dr. Nidhi Jha', '4 Weeks', 5000.00, 10, 'Added', 'A comprehensive 4-week holistic gut microbiome reset program.', 'Restores digestive fire (Agni) and strengthens gastrointestinal lining with bespoke herbal protocols.', 'Relieves bloating, improves digestion, boosts vitality and enhances nutrient absorption.', 'Weekly Ayurvedic consultations, personalized meal plan, herbal formulations, and lifestyle chart.', 'Warm herbal water, dosha-specific digestive kichadi, and prebiotic fiber additions.', 'Pawanmuktasana series, Vajrasana post meals, and core strengthening physiotherapy.', 'Morning warm water with ghee, tongue scraping, and early dinner routine before 7 PM.', '30 minutes brisk walking in morning sunlight and 10 minutes deep belly breathing.', 'Bi-weekly symptom score check-in via mobile portal and weight tracking.', 'Weekly review with senior Ayurveda physician and dietary adjustments.', 'Active'),
(2, 'PKG-002', 'Reset Your Hormones', 'Hormonal Health', 'Dr. Nidhi Jha', '6 Weeks', 7500.00, 14, 'Added', 'Balance endocrine health and manage PCOS/Thyroid symptoms naturally.', 'Ayurvedic holistic therapies combined with therapeutic yoga to balance endocrine glands.', 'Regulates cycles, minimizes fatigue, and alleviates hormonal mood fluctuations.', 'Doctor consultations, custom herbal decoctions, and guided yoga sessions.', 'Phytoestrogen-rich nutrition, anti-inflammatory seed cycling, and herbal infusions.', 'Surya Namaskar, butterfly posture, and restorative pelvic floor exercises.', 'Abhyanga self-massage with warm sesame oil and soothing evening meditation.', 'Daily 45 minutes mixed aerobic movement and yoga nidra for restful sleep.', 'Monthly cycle tracker and hormone biomarker progression audits.', 'Fortnightly medical consultation and herbal formulation updates.', 'Active'),
(3, 'PKG-003', 'Stresscare & Sleep Optimization', 'Mental Wellness', 'Dr. Nidhi Jha', '4 Weeks', 4500.00, 12, 'Added', 'Deep rejuvenation therapy designed to reduce cortisol and restore sleep architecture.', 'Integrates Panchakarma Shirodhara, herbal nervine tonics, and pranayama.', 'Lowers stress levels, relieves anxiety, and enhances sleep quality.', 'Weekly stress assessment, Brahmi herbal teas, and relaxation audio guides.', 'Soothing warm almond milk with nutmeg before bed, low-caffeine diet.', 'Pranayama (Anulom Vilom, Bhramari) and gentle stretching.', 'Nasya therapy with Anu Taila and foot massage (Padabhyanga) before sleep.', 'Daily evening nature walk without electronic devices.', 'Sleep diary monitoring and heart-rate variability (HRV) metrics.', 'Weekly wellness counseling and progress feedback session.', 'Active'),
(4, 'PKG-004', 'Work On Metabolism & Weight Rehab', 'Metabolic Care', 'Dr. Nidhi Jha', '8 Weeks', 9000.00, 9, 'Added', 'Kickstart basal metabolic rate with classical Ayurveda and physical conditioning.', 'Accelerates fat metabolism through Medohar formulations and tailored physiotherapy.', 'Healthy sustainable weight loss, improved lipid profiles, and boundless energy.', '1-on-1 diet chart, metabolic booster herbal formulas, and weekly body composition checks.', 'Warm spiced digestive teas (ginger, cumin, coriander) and timed eating intervals.', 'Dynamic metabolic yoga drills and resistance band physiotherapy routines.', 'Dry herbal powder massage (Udvartana) to stimulate lymphatic flow.', '10,000 steps daily target with interval pacing.', 'Weekly inch loss tracking and metabolic health review.', 'Bi-weekly doctor consultations and custom recipe guides.', 'Active')
ON DUPLICATE KEY UPDATE `package_name` = VALUES(`package_name`), `price` = VALUES(`price`);


-- ----------------------------------------------------------------------------
-- Table: appointments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `appointments` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `appointment_id` VARCHAR(50) DEFAULT NULL,
  `patient_id` INT(11) DEFAULT NULL,
  `patient_name` VARCHAR(150) NOT NULL,
  `doctor_id` INT(11) DEFAULT NULL,
  `doctor_name` VARCHAR(150) NOT NULL,
  `package_name` VARCHAR(150) DEFAULT 'Stress Management',
  `appointment_date` DATE NOT NULL,
  `appointment_time` VARCHAR(50) NOT NULL DEFAULT '8:00 AM',
  `duration` VARCHAR(30) NOT NULL DEFAULT '45 min',
  `service_type` VARCHAR(150) DEFAULT 'Consultation & Rehab',
  `agenda` TEXT DEFAULT NULL,
  `prescription` TEXT DEFAULT NULL,
  `status` ENUM('Scheduled', 'Upcoming', 'Completed', 'Cancelled', 'Pending') NOT NULL DEFAULT 'Scheduled',
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_appointment_code` (`appointment_id`),
  KEY `fk_appt_patient` (`patient_id`),
  KEY `fk_appt_doctor` (`doctor_id`),
  KEY `idx_appt_date` (`appointment_date`),
  KEY `idx_appt_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Appointments
INSERT INTO `appointments` (`id`, `appointment_id`, `patient_id`, `patient_name`, `doctor_id`, `doctor_name`, `package_name`, `appointment_date`, `appointment_time`, `duration`, `agenda`, `prescription`, `status`) VALUES
(1, 'ABC-001', 1, 'Rahul Mishra', 1, 'Dr. Nidhi Jha', 'Stress Management', CURDATE(), '8:00 AM', '45 min', 'Follow-up consultation for stress care protocol and sleep quality check.', 'Ashwagandha Churna 3g twice daily with warm milk, Brahmi Vati 1 tablet before bed.', 'Scheduled'),
(2, 'ABC-002', 2, 'Pooja Deshmukh', 1, 'Dr. Nidhi Jha', 'Reset Your Hormones', CURDATE(), '9:30 AM', '45 min', 'Hormonal balance progress review and diet adherence monitoring.', 'Shatavari Ghruta 1 tsp morning empty stomach, Kanchnar Guggulu 2 tablets twice daily.', 'Scheduled'),
(3, 'ABC-003', 3, 'Vikram Malhotra', 2, 'Dr. Rohit Mehra', 'Gut Healing Package', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '11:00 AM', '45 min', 'Musculoskeletal assessment and lower back rehab physiotherapy exercise review.', 'Kottamchukkadi Taila local application followed by hot fomentation.', 'Completed'),
(4, 'ABC-004', 4, 'Ananya Sengupta', 4, 'Dr. Ankit Verma', 'Work On Metabolism', DATE_SUB(CURDATE(), INTERVAL 2 DAY), '2:00 PM', '45 min', 'Metabolic checkup and digestive enzyme analysis.', 'Triphala Guggulu 2 tablets before bedtime with warm water.', 'Completed'),
(5, 'ABC-005', 5, 'Suresh Iyer', 3, 'Dr. Priya Patel', 'Stresscare', DATE_SUB(CURDATE(), INTERVAL 3 DAY), '4:15 PM', '45 min', 'Panchakarma Shirodhara post-therapy evaluation.', 'Manasamitra Vatakam 1 tab at bedtime, daily Nasya with Anu Taila.', 'Completed')
ON DUPLICATE KEY UPDATE `patient_name` = VALUES(`patient_name`), `doctor_name` = VALUES(`doctor_name`);


-- ----------------------------------------------------------------------------
-- Table: workshops
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `workshops` (
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
  `location` VARCHAR(150) NOT NULL DEFAULT 'Ocayur Center / Hybrid Online',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Workshops
INSERT INTO `workshops` (`id`, `workshop_id`, `title`, `subtitle`, `assign_speaker`, `meet_link`, `instructor`, `speaker`, `speaker_role`, `attendee_type`, `date`, `time`, `duration_text`, `location`, `capacity`, `registrations`, `fee`, `price`, `about`, `image_url`, `status`) VALUES
(1, 'WS-001', 'Mindset For Business World Of Ayurveda', 'Holistic Health & Ayurveda Insights', 'Dr. Nidhi Jha', 'https://meet.google.com/xyz-abcd-efg', 'Dr. Nidhi Jha', 'Dr. Nidhi Jha & Team', 'Ayurveda Physician', 'Doctor', '2026-09-02', '8:00 AM', 'One Month Workshop', 'Ocayur Center Hall A', 50, 24, 5999.00, 5999.00, 'Comprehensive immersion into clinical Ayurveda protocols, pulse diagnostics, and business insights.', 'assets/courses/course_business.jpg', 'Upcoming'),
(2, 'WS-002', 'Skill Development Guide For Ayurveda Doctors', 'Holistic Health & Ayurveda Insights', 'Dr. Rajesh Varma', 'https://meet.google.com/bmq-ypeq-eur', 'Dr. Rajesh Varma', 'Dr. Rajesh Varma', 'Ayurveda Physician', 'Patient', '2026-09-03', '8:00 AM', '90 mins', 'Rehab Studio 2', 40, 18, 799.00, 799.00, 'Hands-on practical workshop covering advanced musculoskeletal assessment, postural restoration, and spine decompression therapies.', 'assets/courses/course_ayurveda_herbs.jpg', 'Upcoming'),
(3, 'WS-003', 'Telemedicine Necessities Laws & AI', 'Holistic Health & Ayurveda Insights', 'Dr. Sneha Patil', 'https://meet.google.com/bmq-ypeq-eur', 'Dr. Sneha Patil', 'Dr. Sneha Patil', 'Ayurveda Physician', 'Patient', '2026-09-03', '8:00 AM', '90 mins', 'Auditorium & Live Stream', 100, 42, 799.00, 799.00, 'Explore how patient tele-health protocols and AI wellness aids provide accessible, safe, and round-the-clock Ayurvedic guidance.', 'assets/courses/course_telemedicine.jpg', 'Upcoming'),
(4, 'WS-004', 'Online Consultation + Marketing Strategy', 'Holistic Health & Ayurveda Insights', 'Dr. Amit Kulkarni', 'https://meet.google.com/bmq-ypeq-eur', 'Dr. Amit Kulkarni', 'Dr. Amit Kulkarni', 'Ayurveda Physician', 'Doctor', '2026-09-03', '8:00 AM', '90 mins', 'Online Zoom Room', 75, 60, 799.00, 799.00, 'Practical breathwork, desk ergonomic routines, and mindful dietary habits for high-stress corporate environments.', 'assets/courses/course_consultation.jpg', 'Upcoming'),
(5, 'WS-005', 'Garbhasanskaar & Future Approach of Ayurveda', 'Holistic Health & Ayurveda Insights', 'Dr. Pooja Joshi', 'https://meet.google.com/bmq-ypeq-eur', 'Dr. Pooja Joshi', 'Dr. Pooja Joshi', 'Ayurveda Physician', 'Doctor', '2026-09-03', '8:00 AM', '90 mins', 'Ocayur Center Hall A', 50, 2, 499.00, 499.00, 'Ayurveda Prenatal Guidance, Mind-Body Preparation and lifestyle harmony.', 'assets/courses/course_garbhasanskaar.jpg', 'Upcoming')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `attendee_type` = VALUES(`attendee_type`), `instructor` = VALUES(`instructor`);


-- ----------------------------------------------------------------------------
-- Table: recommended_packages (Packages specifically recommended by doctor for patient)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `recommended_packages` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `patient_id` INT(11) DEFAULT NULL,
  `patient_phone` VARCHAR(20) DEFAULT NULL,
  `package_id` INT(11) DEFAULT NULL,
  `package_name` VARCHAR(150) NOT NULL,
  `doctor_id` INT(11) DEFAULT NULL,
  `doctor_name` VARCHAR(150) NOT NULL DEFAULT 'Dr. Nidhi Jha',
  `recommendation_note` TEXT DEFAULT NULL,
  `status` ENUM('Recommended', 'Accepted', 'Dismissed') NOT NULL DEFAULT 'Recommended',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rec_patient` (`patient_id`),
  KEY `idx_rec_phone` (`patient_phone`),
  KEY `idx_rec_pkg` (`package_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Recommended Packages
INSERT INTO `recommended_packages` (`id`, `patient_id`, `patient_phone`, `package_id`, `package_name`, `doctor_id`, `doctor_name`, `recommendation_note`, `status`) VALUES
(1, 1, '9876543210', 2, 'Reset Your Hormones', 1, 'Dr. Nidhi Jha', 'Recommended based on your recent metabolic and hormonal assessment to restore endocrine balance.', 'Recommended'),
(2, 1, '9876543210', 4, 'Work On Metabolism & Weight Rehab', 2, 'Dr. Rohit Mehra', 'Recommended for improving digestive fire (Agni) and postural core strengthening.', 'Recommended')
ON DUPLICATE KEY UPDATE `recommendation_note` = VALUES(`recommendation_note`);


-- ----------------------------------------------------------------------------
-- Table: patient_packages (Packages booked and enrolled by patients)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `patient_packages` (
  `id` INT(11) NOT NULL AUTO_INCREMENT,
  `booking_id` VARCHAR(50) DEFAULT NULL,
  `patient_id` INT(11) DEFAULT NULL,
  `patient_phone` VARCHAR(20) DEFAULT NULL,
  `package_id` INT(11) DEFAULT NULL,
  `package_name` VARCHAR(150) NOT NULL,
  `doctor_id` INT(11) DEFAULT NULL,
  `doctor_name` VARCHAR(150) DEFAULT 'Dr. Nidhi Jha',
  `price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `booking_date` DATE DEFAULT NULL,
  `status` ENUM('Active', 'Ongoing', 'Completed', 'Cancelled') NOT NULL DEFAULT 'Active',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pp_patient` (`patient_id`),
  KEY `idx_pp_phone` (`patient_phone`),
  KEY `idx_pp_pkg` (`package_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample Seed Data for Patient Packages
INSERT INTO `patient_packages` (`id`, `booking_id`, `patient_id`, `patient_phone`, `package_id`, `package_name`, `doctor_id`, `doctor_name`, `price`, `booking_date`, `status`) VALUES
(1, '#842195', 1, '9876543210', 1, 'Gut Reset Workshop', 1, 'Dr. Nidhi Jha', 5000.00, CURDATE(), 'Active'),
(2, '#731409', 1, '9876543210', 3, 'Stresscare & Sleep Optimization', 1, 'Dr. Nidhi Jha', 4500.00, DATE_SUB(CURDATE(), INTERVAL 14 DAY), 'Ongoing')
ON DUPLICATE KEY UPDATE `package_name` = VALUES(`package_name`), `status` = VALUES(`status`);

COMMIT;


