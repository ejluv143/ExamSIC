<?php
// Builds a fresh SQLite database from the question's tables: php seed.php <sql file> <database file>
[, $sqlFile, $dbFile] = $argv;
$pdo = new PDO('sqlite:' . $dbFile);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
try {
    $pdo->exec(file_get_contents($sqlFile));
} catch (PDOException $e) {
    fwrite(STDERR, "The question's tables couldn't be created: " . $e->getMessage() . "\n");
    exit(1);
}
