<?php
/**
 * PatchPilot Lab - Dummy PHP Target Script
 * For isolated local testing and defensive inspection only.
 */

header('Content-Type: application/json');
header('X-Powered-By: PHP/8.2.0');

echo json_encode([
    'app' => 'PatchPilot Lab Target',
    'status' => 'active',
    'php_version' => PHP_VERSION,
    'message' => 'Isolated test endpoint for PatchPilot security analysis.'
]);

