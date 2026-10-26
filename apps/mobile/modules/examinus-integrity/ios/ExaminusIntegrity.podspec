Pod::Spec.new do |s|
  s.name           = 'ExaminusIntegrity'
  s.version        = '1.0.0'
  s.summary        = 'What the exam screen can see about itself on iOS'
  s.description    = 'Guided Access, screen recording and mirroring, and external displays, for the Examinus student app.'
  s.author         = 'Examinus'
  s.homepage       = 'https://examinus.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = "**/*.{h,m,swift}"
end
