export function unityProjectSettings(title: string, productGuid: string, sceneGuid = productGuid): Record<string, string> {
  return {
    'ProjectSettings/ProjectVersion.txt': `m_EditorVersion: 6000.3.0f1
m_EditorVersionWithRevision: 6000.3.0f1 (000000000000)
`,
    'ProjectSettings/ProjectSettings.asset': `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!129 &1
PlayerSettings:
  serializedVersion: 28
  productGUID: ${productGuid}
  AndroidProfiler: 0
  AndroidFilterTouchesWhenObscured: 0
  AndroidEnableSustainedPerformanceMode: 0
  defaultScreenOrientation: 4
  targetDevice: 2
  useOnDemandResources: 0
  accelerometerFrequency: 60
  companyName: MetroForge
  productName: ${JSON.stringify(title).slice(1, -1)}
  defaultCursor: {fileID: 0}
  cursorHotspot: {x: 0, y: 0}
  m_SplashScreenBackgroundColor: {r: 0.07, g: 0.08, b: 0.1, a: 1}
  m_ShowUnitySplashScreen: 0
  defaultIsNativeResolution: 1
  macRetinaSupport: 1
  runInBackground: 1
  captureSingleScreen: 0
  muteOtherAudioSources: 0
  Prepare IOS For Recording: 0
  Force IOS Speakers When Recording: 0
  audioSpatialExperience: 0
  defaultScreenWidth: 1920
  defaultScreenHeight: 1080
  defaultScreenWidthWeb: 960
  defaultScreenHeightWeb: 540
  m_StereoRenderingPath: 0
  m_ActiveColorSpace: 0
  m_SpriteBatchVertexThreshold: 300
  m_MTRendering: 1
  mipStripping: 0
  numberOfMipsStripped: 0
  numberOfMipsStrippedPerMipmapLimitGroup: {}
  m_StackTraceTypes: 010000000100000001000000010000000100000001000000
  iosShowActivityIndicatorOnLoading: -1
  androidShowActivityIndicatorOnLoading: -1
  iosUseCustomAppBackgroundBehavior: 0
  allowedAutorotateToPortrait: 1
  allowedAutorotateToPortraitUpsideDown: 1
  allowedAutorotateToLandscapeRight: 1
  allowedAutorotateToLandscapeLeft: 1
  useOSAutorotation: 1
  use32BitDisplayBuffer: 1
  preserveFramebufferAlpha: 0
  disableDepthAndStencilBuffers: 0
  androidStartInFullscreen: 1
  androidRenderOutsideSafeArea: 1
  androidUseSwappy: 1
  androidBlitType: 0
  androidResizeableActivity: 1
  androidDefaultWindowWidth: 1920
  androidDefaultWindowHeight: 1080
  androidMinimumWindowWidth: 400
  androidMinimumWindowHeight: 300
  androidFullscreenMode: 1
  androidAutoRotationBehavior: 1
  androidPredictiveBackSupport: 0
  androidApplicationEntry: 1
  defaultIsFullScreen: 1
  defaultIsNativeResolution: 1
  macRetinaSupport: 1
  useFlipModelSwapchain: 1
  gpuSkinning: 0
  meshDeformation: 0
  xboxPIXTextureCapture: 0
  xboxEnableAvatar: 0
  xboxEnableKinect: 0
  xboxEnableKinectAutoTracking: 0
  xboxEnableFitness: 0
  visibleInBackground: 1
  allowFullscreenSwitch: 1
  fullscreenMode: 3
  xboxSpeechDB: 0
  xboxEnableHeadOrientation: 0
  xboxEnableGuest: 0
  xboxEnablePIXSampling: 0
  metalFramebufferOnly: 0
  xboxOneResolution: 0
  xboxOneSResolution: 0
  xboxOneXResolution: 3
  xboxOneMonoLoggingLevel: 0
  xboxOneLoggingLevel: 1
  xboxOneDisableEsram: 0
  xboxOneEnableTypeOptimization: 0
  xboxOnePresentImmediateThreshold: 0
  switchQueueCommandMemory: 1048576
  switchQueueControlMemory: 16384
  switchQueueComputeMemory: 262144
  switchNVNShaderPoolsGranularity: 33554432
  switchNVNDefaultPoolsGranularity: 16777216
  switchNVNOtherPoolsGranularity: 16777216
  switchGpuScratchPoolGranularity: 2097152
  switchAllowGpuScratchShrinking: 0
  switchNVNMaxPublicTextureIDCount: 0
  switchNVNMaxPublicSamplerIDCount: 0
  switchMaxWorkerMultiple: 8
  switchNVNGraphicsFirmwareMemory: 32
  vulkanNumSwapchainBuffers: 3
  vulkanEnableSetSRGBWrite: 0
  vulkanEnablePreTransform: 0
  vulkanEnableLateAcquireNextImage: 0
  vulkanEnableCommandBufferRecycling: 1
  loadStoreDebugModeEnabled: 0
  bundleVersion: 0.1.0
  preloadedAssets: []
  metroInputSource: 0
  wsaTransparentSwapchain: 0
  xboxOneDisableKinectGpuReservation: 1
  xboxOneEnable7thCore: 1
  vrSettings:
    enable360StereoCapture: 0
  isWsaHolographicRemotingEnabled: 0
  enableNativePlatformBackendsForN3ds: 0
  enableFrameTimingStats: 0
  enableOpenGLProfilerGPURecorders: 1
  allowHDRDisplaySupport: 0
  useHDRDisplay: 0
  hdrBitDepth: 0
  m_ColorGamuts: 00000000
  targetPixelDensity: 30
  resolutionScalingMode: 0
  resetResolutionOnWindowResize: 0
  androidSupportedAspectRatio: 1
  androidMaxAspectRatio: 2.1
  androidMinAspectRatio: 1
  applicationIdentifier:
    Standalone: com.MetroForge.Generated
  buildNumber:
    Standalone: 0
    VisionOS: 0
    iPhone: 0
    tvOS: 0
  overrideDefaultApplicationIdentifier: 0
  AndroidBundleVersionCode: 1
  AndroidMinSdkVersion: 23
  AndroidTargetSdkVersion: 0
  AndroidPreferredInstallLocation: 1
  aotOptions: 
  stripEngineCode: 1
  iPhoneStrippingLevel: 0
  iPhoneScriptCallOptimization: 0
  ForceInternetPermission: 0
  ForceSDCardPermission: 0
  CreateWallpaper: 0
  androidSplitApplicationBinary: 0
  keepLoadedShadersAlive: 0
  StripUnusedMeshComponents: 1
  strictShaderVariantMatching: 0
  VertexChannelCompressionMask: 4054
  iPhoneSdkVersion: 988
  iOSSimulatorArchitecture: 0
  iOSTargetOSVersionString: 13.0
  tvOSSdkVersion: 0
  tvOSSimulatorArchitecture: 0
  tvOSRequireExtendedGameController: 0
  tvOSTargetOSVersionString: 13.0
  VisionOSSdkVersion: 0
  VisionOSTargetOSVersionString: 1.0
  uIPrerenderedIcon: 0
  uIRequiresPersistentWiFi: 0
  uIRequiresFullScreen: 1
  uIStatusBarHidden: 1
  uIExitOnSuspend: 0
  uIStatusBarStyle: 0
  appleTVSplashScreen: {fileID: 0}
  appleTVSplashScreen2x: {fileID: 0}
  tvOSSmallIconLayers: []
  tvOSSmallIconLayers2x: []
  tvOSLargeIconLayers: []
  tvOSLargeIconLayers2x: []
  tvOSTopShelfImageLayers: []
  tvOSTopShelfImageLayers2x: []
  tvOSTopShelfImageWideLayers: []
  tvOSTopShelfImageWideLayers2x: []
  iOSLaunchScreenType: 0
  iOSLaunchScreenPortrait: {fileID: 0}
  iOSLaunchScreenLandscape: {fileID: 0}
  iOSLaunchScreenBackgroundColor:
    serializedVersion: 2
    rgba: 0
  iOSLaunchScreenFillPct: 100
  iOSLaunchScreenSize: 100
  iOSLaunchScreenCustomXibPath: 
  iOSLaunchScreeniPadType: 0
  iOSLaunchScreeniPadImage: {fileID: 0}
  iOSLaunchScreeniPadBackgroundColor:
    serializedVersion: 2
    rgba: 0
  iOSLaunchScreeniPadFillPct: 100
  iOSLaunchScreeniPadSize: 100
  iOSLaunchScreeniPadCustomXibPath: 
  iOSLaunchScreenCustomStoryboardPath: 
  iOSLaunchScreeniPadCustomStoryboardPath: 
  iOSDeviceRequirements: []
  iOSURLSchemes: []
  macOSURLSchemes: []
  iOSBackgroundModes: 0
  iOSMetalForceHardShadows: 0
  metalEditorSupport: 1
  metalAPIValidation: 1
  metalCompileShaderBinary: 0
  iOSRenderExtraFrameOnPause: 0
  iosCopyPluginsCodeInsteadOfProjectReferences: 1
  appleDeveloperTeamID: 
  iOSManualSigningProvisioningProfileID: 
  tvOSManualSigningProvisioningProfileID: 
  VisionOSManualSigningProvisioningProfileID: 
  iOSManualSigningProvisioningProfileType: 0
  tvOSManualSigningProvisioningProfileType: 0
  VisionOSManualSigningProvisioningProfileType: 0
  appleEnableAutomaticSigning: 0
  iOSRequireARKit: 0
  iOSAutomaticallyDetectAndAddCapabilities: 1
  appleEnableProMotion: 0
  shaderPrecisionModel: 0
  clonedFromGUID: 00000000000000000000000000000000
  templatePackageId: 
  templateDefaultScene: Assets/Scenes/World.unity
  useCustomMainManifest: 0
  useCustomLauncherManifest: 0
  useCustomMainGradleTemplate: 0
  useCustomLauncherGradleManifest: 0
  useCustomBaseGradleTemplate: 0
  useCustomGradlePropertiesTemplate: 0
  useCustomGradleSettingsTemplate: 0
  useCustomProguardFile: 0
  AndroidTargetArchitectures: 2
  AndroidSplashScreenScale: 0
  androidSplashScreen: {fileID: 0}
  AndroidKeystoreName: 
  AndroidKeyaliasName: 
  AndroidEnableArmv9SecurityFeatures: 0
  AndroidEnableArm64MTE: 0
  AndroidBuildApkPerCpuArchitecture: 0
  AndroidTVCompatibility: 0
  AndroidIsGame: 1
  AndroidEnableTango: 0
  androidEnableBanner: 1
  androidUseLowAccuracyLocation: 0
  androidUseCustomKeystore: 0
  m_AndroidBanners: []
  androidGamepadSupportLevel: 0
  AndroidMinifyRelease: 0
  AndroidMinifyDebug: 0
  AndroidValidateAppBundleSize: 1
  AndroidAppBundleSizeToValidate: 150
  AndroidReportGooglePlayAppDependencies: 1
  m_BuildTargetGroupLightmapEncodingQuality: []
  m_BuildTargetGroupHDRCubemapEncodingQuality: []
  m_BuildTargetGroupLightmapSettings: []
  m_BuildTargetGroupLoadStoreDebugModeSettings: []
  m_BuildTargetNormalMapEncoding: []
  m_BuildTargetDefaultTextureCompressionFormat: []
  playModeTestRunnerEnabled: 0
  runPlayModeTestAsEditModeTest: 0
  actionOnDotNetUnhandledException: 1
  editorGfxJobOverride: 1
  enableInternalProfiler: 0
  logObjCUncaughtExceptions: 1
  enableCrashReportAPI: 0
  cameraUsageDescription: 
  locationUsageDescription: 
  microphoneUsageDescription: 
  bluetoothUsageDescription: 
  macOSTargetOSVersion: 11.0
  switchNMETAOverlayFile: 
  switchRamDiskSpaceSize: 12
  activeInputHandler: 2
  windowsGamepadBackendHint: 0
  cloudProjectId: 
  framebufferDepth: 24
  metalEditorSupport: 1
  m_RenderingPath: 1
  m_MobileRenderingPath: 1
  metroPackageName: MetroForgeGenerated
  metroPackageVersion: 
  metroCertificatePath: 
  metroCertificatePassword: 
  metroCertificateSubject: 
  metroCertificateIssuer: 
  metroCertificateNotAfter: 0000000000000000
  metroApplicationDescription: Generated MetroForge slice
  wsaImages: {}
  metroTileShortName: 
  metroTileShowName: 0
  metroMediumTileShowName: 0
  metroLargeTileShowName: 0
  metroWideTileShowName: 0
  metroSupportStreamingInstall: 0
  metroLastRequiredScene: 0
  metroDefaultTileSize: 1
  metroTileForegroundText: 2
  metroTileBackgroundColor: {r: 0.13333334, g: 0.17254902, b: 0.21568628, a: 0}
  metroSplashScreenBackgroundColor: {r: 0.12941177, g: 0.17254902, b: 0.21568628, a: 1}
  metroSplashScreenUseBackgroundColor: 0
  platformCapabilities: {}
  metroTargetDeviceFamilies: {}
  metroFTAName: 
  metroFTAFileTypes: []
  metroProtocolName: 
  XboxOneProductId: 
  XboxOneUpdateKey: 
  XboxOneSandboxId: 
  XboxOneContentId: 
  XboxOneTitleId: 
  XboxOneSCId: 
  XboxOneGameOsOverridePath: 
  XboxOnePackagingOverridePath: 
  XboxOneAppManifestOverridePath: 
  XboxOneVersion: 1.0.0.0
  XboxOnePackageEncryption: 0
  XboxOnePackageUpdateGranularity: 2
  XboxOneDescription: 
  XboxOneLanguage:
  - enus
  XboxOneCapability: []
  XboxOneGameRating: {}
  XboxOneIsContentPackage: 0
  XboxOneEnhancedXboxCompatibilityMode: 0
  XboxOneEnableGPUVariability: 1
  XboxOneSockets: {}
  XboxOneSplashScreen: {fileID: 0}
  XboxOneAllowedProductIds: []
  XboxOnePersistentLocalStorageSize: 0
  XboxOneXTitleMemory: 8
  XboxOneOverrideIdentityName: 
  XboxOneOverrideIdentityPublisher: 
  vrEditorSettings: {}
  cloudServicesEnabled: {}
  luminIcon:
    m_Name: 
    m_ModelFolderPath: 
    m_PortalFolderPath: 
  luminCert:
    m_CertPath: 
    m_SignPackage: 1
  luminIsChannelApp: 0
  luminVersion:
    m_VersionCode: 1
    m_VersionName: 
  hmiPlayerDataPath: 
  hmiForceSRGBBlit: 1
  embeddedLinuxEnableGamepadInput: 0
  hmiCpuConfiguration: 
  hmiLogStartupTiming: 0
  qnxGraphicConfPath: 
  apiCompatibilityLevel: 6
  captureStartupLogs: {}
  activeInputHandler: 2
  windowsGamepadBackendHint: 0
  cloudProjectId: 
  framebufferDepth: 24
  m_SplashScreenLogos: []
  m_VirtualRealitySplashScreen: {fileID: 0}
  m_HolographicTrackingLossScreen: {fileID: 0}
  defaultScreenWidth: 1920
  defaultScreenHeight: 1080
  defaultWebScreenWidth: 960
  defaultWebScreenHeight: 540
  m_StereoRenderingPath: 0
  m_ActiveColorSpace: 0
  unsupportedMSAAFallback: 0
  m_SpriteBatchMaxVertexCount: 65535
  m_SpriteBatchVertexThreshold: 300
  m_MTRendering: 1
  qualitySettingsNames: []
  projectName: ${JSON.stringify(title).slice(1, -1)}
  organizationId: 
  cloudEnabled: 0
  legacyClampBlendShapeWeights: 0
  hmiLoadingImage: {fileID: 0}
  platformRequiresReadableAssets: 0
  virtualTexturingSupportEnabled: 0
  insecureHttpOption: 0
`,
    'Packages/manifest.json': `${JSON.stringify(
      {
        dependencies: {
          'com.unity.2d.sprite': '1.0.0',
          'com.unity.2d.tilemap': '1.0.0',
          'com.unity.inputsystem': '1.14.2',
          'com.unity.ugui': '2.0.0',
          'com.unity.modules.animation': '1.0.0',
          'com.unity.modules.audio': '1.0.0',
          'com.unity.modules.imageconversion': '1.0.0',
          'com.unity.modules.imgui': '1.0.0',
          'com.unity.modules.jsonserialize': '1.0.0',
          'com.unity.modules.physics2d': '1.0.0',
          'com.unity.modules.ui': '1.0.0',
          'com.unity.modules.uielements': '1.0.0',
        },
      },
      null,
      2,
    )}\n`,
    'ProjectSettings/EditorBuildSettings.asset': `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!1045 &1
EditorBuildSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 2
  m_Scenes:
  - enabled: 1
    path: Assets/Scenes/World.unity
    guid: ${sceneGuid}
  m_configObjects: {}
`,
    'ProjectSettings/TagManager.asset': `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!78 &1
TagManager:
  serializedVersion: 2
        tags:
        - Pickup
        - Checkpoint
        - Victory
        layers:
  - Default
  - TransparentFX
  - Ignore Raycast
  - 
  - Water
  - UI
  - Ground
  - Actor
  - Hitbox
  - Hurtbox
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  - 
  m_SortingLayers:
  - name: Default
    uniqueID: 0
    locked: 0
  - name: Background
    uniqueID: 1000
    locked: 0
  - name: World
    uniqueID: 2000
    locked: 0
  - name: Actors
    uniqueID: 3000
    locked: 0
  - name: Foreground
    uniqueID: 4000
    locked: 0
`,
    'ProjectSettings/Physics2DSettings.asset': `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!19 &1
Physics2DSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 6
  m_Gravity: {x: 0, y: -980}
  m_DefaultMaterial: {fileID: 0}
  m_VelocityIterations: 8
  m_PositionIterations: 3
  m_VelocityThreshold: 1
  m_MaxLinearCorrection: 0.2
  m_MaxAngularCorrection: 8
  m_MaxTranslationSpeed: 10000
  m_MaxRotationSpeed: 360
  m_BaumgarteScale: 0.2
  m_BaumgarteTimeOfImpactScale: 0.75
  m_TimeToSleep: 0.5
  m_LinearSleepTolerance: 0.01
  m_AngularSleepTolerance: 2
  m_DefaultContactOffset: 0.01
  m_JobOptions:
    serializedVersion: 2
    useMultithreading: 0
    useConsistencySorting: 0
    interpolationPosesPerJob: 100
    newContactsPerJob: 30
    collideContactsPerJob: 100
    clearFlagsPerJob: 200
    clearBodyForcesPerJob: 200
    syncDiscreteFixturesPerJob: 50
    syncContinuousFixturesPerJob: 50
    findNearestContactsPerJob: 100
    updateTriggerContactsPerJob: 100
    islandSolverCostThreshold: 100
    islandSolverBodyCostScale: 1
    islandSolverContactCostScale: 10
    islandSolverJointCostScale: 10
    islandSolverBodiesPerJob: 50
    islandSolverContactsPerJob: 50
  m_SimulationMode: 0
  m_QueriesHitTriggers: 1
  m_QueriesStartInColliders: 1
  m_CallbacksOnDisable: 1
  m_ReuseCollisionCallbacks: 1
  m_AutoSyncTransforms: 0
  m_GizmoOptions: 10
  m_LayerCollisionMatrix: ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff
`,
    'ProjectSettings/EditorSettings.asset': `%YAML 1.1
%TAG !u! tag:unity3d.com,2011:
--- !u!159 &1
EditorSettings:
  m_ObjectHideFlags: 0
  serializedVersion: 13
  m_SerializationMode: 2
  m_LineEndingsForNewScripts: 0
  m_DefaultBehaviorMode: 1
  m_PrefabRegularEnvironment: {fileID: 0}
  m_PrefabUIEnvironment: {fileID: 0}
  m_SpritePackerMode: 4
  m_SpritePackerCacheSize: 10
  m_SpritePackerPaddingPower: 1
  m_Bc7TextureCompressor: 0
  m_EtcTextureCompressorBehavior: 1
  m_EtcTextureFastCompressor: 1
  m_EtcTextureNormalCompressor: 2
  m_EtcTextureBestCompressor: 4
  m_ProjectGenerationIncludedExtensions: txt;xml;fnt;cd;asmdef;asmref;rsp
  m_ProjectGenerationRootNamespace: 
  m_EnableTextureStreamingInEditMode: 1
  m_EnableTextureStreamingInPlayMode: 1
  m_EnableEditorAsyncCPUTextureLoading: 0
  m_AsyncShaderCompilation: 1
  m_PrefabModeAllowAutoSave: 1
  m_EnterPlayModeOptionsEnabled: 0
  m_EnterPlayModeOptions: 3
  m_GameObjectNamingDigits: 1
  m_GameObjectNamingScheme: 0
  m_AssetNamingUsesSpace: 1
  m_InspectorUseIMGUIDefaultInspector: 0
  m_UseLegacyProbeSampleCount: 0
  m_SerializeInlineMappingsOnOneLine: 1
  m_DisableCookiesInLightmapper: 1
  m_AssetPipelineMode: 1
  m_RefreshImportMode: 0
  m_CacheServerMode: 0
  m_CacheServerEndpoint: 
  m_CacheServerNamespacePrefix: default
  m_CacheServerEnableDownload: 1
  m_CacheServerEnableUpload: 1
  m_CacheServerEnableAuth: 0
  m_CacheServerEnableTls: 0
  m_CacheServerValidationMode: 2
  m_CacheServerDownloadBatchSize: 128
  m_EnableEnlightenBakedGI: 0
`,
  };
}
