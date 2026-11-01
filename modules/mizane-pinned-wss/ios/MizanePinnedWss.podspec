Pod::Spec.new do |s|
  s.name           = 'MizanePinnedWss'
  s.version        = '1.0.0'
  s.summary        = 'Pinned WSS transport for the MIZANE Mobile Scanner'
  s.description    = 'A TLS certificate-pinned WebSocket transport for the MIZANE desktop gateway.'
  s.author         = 'MIZANE'
  s.homepage       = 'https://mizane.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
