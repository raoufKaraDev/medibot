-- ═══════════════════════════════════════════════════════════════════
-- MediBot — SQL Population Script
-- Source : Medicament.xlsx — Service Pédiatrie, Hôpital de Rouiba
-- Usage  : sqlite3 medibot.db < populate_medications.sql
-- ═══════════════════════════════════════════════════════════════════

-- Clear and reset
DELETE FROM patient_medications;
DELETE FROM medications;
UPDATE sqlite_sequence SET seq=0 WHERE name='medications';

-- ═══════════════════════════════════════════════════════════════
-- TIROIRS 1-6 (médicaments assignés au robot MediBot)
-- Les 6 médicaments "Très utilisé" / "Utilisé pour tous les malades"
-- ═══════════════════════════════════════════════════════════════
INSERT INTO medications(id, name, dosage, schedule, time, drawer, storage, classe) VALUES
(1, 'PARACETAMOL SOL INJ 1G',          '1g',    'Toutes les 6h',  '08:00', 1, 'T° 20-25° à l''abri de la lumière',          'ANTALGIQUES'),
(2, 'DICLOFENAC SODIQUE INJ 75MG',     '75mg',  'Toutes les 12h', '08:00', 2, 'T° 20-25° à l''abri de la lumière',          'ANTI-INFLAMMATOIRES'),
(3, 'DEXAMETHAZONE SOL INJ 4MG',       '4mg',   'Toutes les 8h',  '08:00', 3, 'T° < 25°',                                   'ENDOCRINOLOGIE'),
(4, 'OMEPRAZOLE INJ IV 40MG',          '40mg',  '1 fois/jour',    '08:00', 4, 'T° 20-25° à l''abri lumière et humidité',    'GASTRO-ENTEROLOGIE'),
(5, 'GENTAMICINE INJ 80MG',            '80mg',  'Toutes les 8h',  '08:00', 5, 'T° < 25°',                                   'INFECTIOLOGIE'),
(6, 'SALBUTAMOL AERO 100µG/BOUFFEE',   '100µg', 'Selon besoin',   '08:00', 6, 'T° < 25° à l''abri de la lumière',          'PNEUMOLOGIE');

-- ═══════════════════════════════════════════════════════════════
-- TOUS LES AUTRES MÉDICAMENTS (catalogue complet — sans tiroir)
-- Drawer = NULL = non dispensable par le robot
-- ═══════════════════════════════════════════════════════════════

-- Anesthésiologie
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('LIDOCAINE INJ 2%',          '2%',   'Cas par cas', '—', NULL, 'T° < 25°',    'ANESTHESIOLOGIE');

-- Antalgiques
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('BUPRENORPHINE INJ 0.3MG/ML','0.3mg','Cas par cas', '—', NULL, 'Armoire psychotropes', 'ANTALGIQUES');

-- Anti-inflammatoires
-- (DICLOFENAC déjà tiror 2)

-- Cancérologie
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('AZATHIOPRINE COMP 50MG',              '50mg',         'Cas par cas', '—', NULL, 'T° < 25°',                            'CANCEROLOGIE'),
('RITUXIMAB SOL PERF 500MG/50ML',       '500mg/50ml',   'Cas par cas', '—', NULL, 'T° 2-8° à l''abri de la lumière',    'CANCEROLOGIE');

-- Cardiologie
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('PROPRANOLOL SOL BUV 37.5',            '37.5mg',       'Cas par cas', '—', NULL, 'T° ambiante', 'CARDIOLOGIE');

-- Dermatologie
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('TULLE OU GAZE/BAUME DU PEROU',        'PM',           'Tous les malades', '—', NULL, 'T° ambiante',                         'DERMATOLOGIE'),
('POLYVIDONE IODEE SOL DERM 10%',       '10%',          'Tous les malades', '—', NULL, 'T° < 25° à l''abri de la lumière',   'DERMATOLOGIE'),
('SULFADIAZINE ARGENTIQUE CRE 1%',      '1%',           'Cas par cas',      '—', NULL, 'T° 15-25° à l''abri de la lumière',  'DERMATOLOGIE');

-- Diagnostic
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('TUBERCULINE PURIFIEE AMP 10DOSES 100UI/MI', '100UI/MI', 'Cas par cas', '—', NULL, 'T° 2-8°', 'DIAGNOSTIC');

-- Endocrinologie (extras)
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('DEXAMETHAZONE SOL INJ 20MG',              '20mg',  'Cas par cas', '—', NULL, 'T° < 25°', 'ENDOCRINOLOGIE'),
('HYDROCORTISONE HEMISUCCINATE PDR SOL INJ','—',     'Cas par cas', '—', NULL, 'T° ambiante', 'ENDOCRINOLOGIE'),
('METHYLPREDNISOLONE SOL INJ 20MG',         '20mg',  'Cas par cas', '—', NULL, 'T° ambiante', 'ENDOCRINOLOGIE'),
('METHYLPREDNISOLONE PDRE SOL INJ 40MG',    '40mg',  'Cas par cas', '—', NULL, 'T° ambiante', 'ENDOCRINOLOGIE'),
('PREDNISONE BASE COMP 5MG',                '5mg',   'Cas par cas', '—', NULL, 'T° ambiante', 'ENDOCRINOLOGIE');

-- Gastro-entérologie (extras)
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('PHLOROGLUCINOL INJ 10MG/ML', '10mg/ml', 'Cas par cas', '—', NULL, 'T° ambiante', 'GASTRO-ENTEROLOGIE');

-- Hématologie et hémostase
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('HBPM ENOXAPARINE SODIQUE INJ SC 2000UI',  '2000UI',  'Cas par cas', '—', NULL, 'T° < 25°',                       'HEMATOLOGIE'),
('HBPM ENOXAPARINE SODIQUE INJ SC 4000UI',  '4000UI',  'Cas par cas', '—', NULL, 'T° ambiante',                    'HEMATOLOGIE'),
('PHYTOMENADIONE SOL INJ/BUV 10MG',         '10mg',    'Cas par cas', '—', NULL, 'T° 25° à l''abri de la lumière', 'HEMATOLOGIE'),
('PHYTOMENADIONE SOL INJ/BUV 2MG',          '2mg',     'Cas par cas', '—', NULL, 'T° ambiante',                    'HEMATOLOGIE'),
('ALBUMINE HUMAINE INJ IV 20% 100ML',        '20%',    'Très utilisé','—', NULL, 'T° < 25°',                       'HEMATOLOGIE'),
('ALBUMINE HUMAINE INJ IV 20% 50ML',         '20%',    'Cas par cas', '—', NULL, 'T° ambiante',                    'HEMATOLOGIE');

-- Infectiologie
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('CEFAZOLINE SOL INJ IV 1G',                    '1g',        'Toutes les 8h',  '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('CEFOTAXIME CLAFORAN PDRE SOL INJ IV 1G',      '1g',        'Toutes les 8h',  '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('CEFTIZOXIME AMP INJ 1G',                       '1g',        'Toutes les 12h', '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('METRONIDAZOLE INJ 500MG',                      '500mg',     'Toutes les 8h',  '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('AMOXICILLINE INJ 1G',                          '1g',        'Toutes les 8h',  '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('AMPICILLINE INJ 1G',                           '1g',        'Toutes les 8h',  '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('AMOXI ACIDE CLAVULANIQUE SOL INJ 1G/200MG',   '1g/200mg',  'Toutes les 8h',  '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('COLIMYCINE PDRE INJ 1000000UI',                '1MUI',      'Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('CIPROFLOXACINE 200MG SOL INJ',                 '200mg',     'Toutes les 12h', '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('CIPROFLOXACINE 400MG SOL INJ',                 '400mg',     'Toutes les 12h', '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('ACICLOVIR PDRE INJ 250MG',                     '250mg',     'Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('RIFAMPICINE ISONIAZID CP 75/50',               '75/50mg',   'Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('ETHAMBUTOL COMP 400MG',                        '400mg',     'Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('RIFAMP/ISONIAZ/PYRAZ COMP 150/75/400MG',       '150/75/400','Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('IMIPENEM SOL INJ 500MG',                       '500mg',     'Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE'),
('IG HUMAINE POLYVAI SOL INJ 5G',                '5g',        'Très utilisé',   '—', NULL, 'T° 2-8° à l''abri de la lumière', 'INFECTIOLOGIE'),
('IG HUMAINE POLYVAI SOL INJ 10G/12G',           '10-12g',    'Cas par cas',    '—', NULL, 'T° ambiante', 'INFECTIOLOGIE');

-- Métabolisme et hémostase
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('GLUCOSE SOL INJ 5%',                           '5%',        'Selon besoin',  '—', NULL, 'T° < 30°',                            'METABOLISME'),
('GLUCOSE SOL INJ 10%',                          '10%',       'Selon besoin',  '—', NULL, 'T° ambiante',                         'METABOLISME'),
('SODIUM BICARBONATE INJ 1.4%',                  '1.4%',      'Selon besoin',  '—', NULL, 'T° ambiante endroit sec',             'METABOLISME'),
('SODIUM CHLORURE INJ 0.9% 250ML',               '0.9%',      'Selon besoin',  '—', NULL, 'T° < 30° endroit sec à l''abri lumière','METABOLISME'),
('SODIUM CHLORURE INJ 0.9% 500ML',               '0.9%',      'Selon besoin',  '—', NULL, 'T° ambiante',                         'METABOLISME'),
('SOLUTION DE REHYDRATATION INJ',                '—',         'Selon besoin',  '—', NULL, 'T° ambiante',                         'METABOLISME'),
('ACIDE ASCORBIQUE INJ 500MG',                   '500mg',     'Cas par cas',   '—', NULL, 'T° 15-25° endroit sec',               'METABOLISME'),
('MELANGE TERNAIRE D ACIDES AMINES 2L',          '2L',        'Cas par cas',   '—', NULL, 'T° < 25°',                            'METABOLISME'),
('IMIGLUCERASE 400UI PDRE PERF IV 20ML',         '400UI',     'Cas par cas',   '—', NULL, 'T° 2-8° à l''abri de la lumière',    'METABOLISME'),
('ELOSULFASE ALPHA 1MG/ML SOL POUR PERF',        '1mg/ml',    'Cas par cas',   '—', NULL, 'T° ambiante',                         'METABOLISME');

-- Neurologie / Psychiatrie (psychotropes)
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('PHENOBARBITAL PDRE SOL INJ 40MG', '40mg', 'Cas par cas', '—', NULL, 'Armoire psychotropes — T° 20-25° lumière+humidité', 'NEUROLOGIE'),
('DIAZEPAM SOL INJ 10MG/2ML',       '10mg', 'Cas par cas', '—', NULL, 'Armoire psychotropes',                              'NEUROLOGIE'),
('CHLORPROMAZINE SOL INJ 25MG',     '25mg', 'Cas par cas', '—', NULL, 'Armoire psychotropes',                              'NEUROLOGIE');

-- Pneumologie (extras)
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('SALBUTAMOL SOL NEBUL 5MG/ML',            '5mg/ml', 'Selon besoin', '—', NULL, 'T° ambiante',  'PNEUMOLOGIE'),
('IPRATROPIUM BROMURE SOL INJ 0.5MG',      '0.5mg',  'Cas par cas',  '—', NULL, 'T° ambiante',  'PNEUMOLOGIE');

-- Toxicologie
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('DEFEROXAMINE SOL INJ 500MG', '500mg', 'Cas par cas', '—', NULL, 'T° < 25°', 'TOXICOLOGIE');

-- Antiseptiques et divers
INSERT INTO medications(name, dosage, schedule, time, drawer, storage, classe) VALUES
('EAU OXYGENEE 10V',                    '10V',  'Tous les malades', '—', NULL, 'Endroit frais sec à l''abri lumière', 'DIVERS'),
('ALCOOL CHIRURGICAL 70%',              '70%',  'Tous les malades', '—', NULL, 'T° ambiante', 'ANTISEPTIQUES'),
('POLYVIDONE IODEE SOL DERM 10% DIVERS','10%',  'Tous les malades', '—', NULL, 'T° ambiante', 'ANTISEPTIQUES'),
('SAVON POUR LAVAGE FREQUENT',          '—',    'Tous les malades', '—', NULL, 'T° ambiante', 'ANTISEPTIQUES'),
('GEL HYDRO ALCOOLIQUE 500ML',          '500ml','Tous les malades', '—', NULL, 'T° ambiante', 'ANTISEPTIQUES');

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════
SELECT 'Médicaments robots (tiroirs 1-6):' AS info;
SELECT id, name, dosage, drawer, classe FROM medications WHERE drawer IS NOT NULL ORDER BY drawer;

SELECT 'Catalogue complet (' || COUNT(*) || ' médicaments):' AS info FROM medications;
