<?php
// Prepended to PHP answers that come with tables: Laravel's database layer on /tmp/db.sqlite, so students
// can write DB::table('students')->get(), use Illuminate\Support\Facades\DB, or define Eloquent models.
require '/opt/laravel/vendor/autoload.php';

$capsule = new Illuminate\Database\Capsule\Manager();
$capsule->addConnection(['driver' => 'sqlite', 'database' => '/tmp/db.sqlite', 'prefix' => '', 'foreign_key_constraints' => true]);
$capsule->setEventDispatcher(new Illuminate\Events\Dispatcher(new Illuminate\Container\Container()));
$capsule->setAsGlobal();
$capsule->bootEloquent();

// The DB facade, as in a Laravel app.
$app = new Illuminate\Container\Container();
$app->instance('db', $capsule->getDatabaseManager());
Illuminate\Support\Facades\Facade::setFacadeApplication($app);
class_alias(Illuminate\Support\Facades\DB::class, 'DB');
unset($capsule, $app);
