Pod::Spec.new do |s|
  s.name           = 'ExaminusAttest'
  s.version        = '0.1.0'
  s.summary        = 'App Attest and jailbreak hints for Examinus exams'
  s.license        = 'UNLICENSED'
  s.author         = 'Examinus'
  s.homepage       = 'https://examinus.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
