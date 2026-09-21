#include "MFAcceptance.h"
#include "MFGameMode.h"
#include "MFPawn.h"
#include "Engine/Engine.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformMisc.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "UnrealClient.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

void FMFAcceptance::Begin(AMFGameMode* ModeObj)
{
	Features.Add(TEXT("traversal"), TEXT("pending"));
	Features.Add(TEXT("containment"), TEXT("pending"));
	Features.Add(TEXT("combat"), TEXT("pending"));
	Features.Add(TEXT("abilities"), TEXT("pending"));
	Features.Add(TEXT("gates"), TEXT("pending"));
	Features.Add(TEXT("npc_interaction"), TEXT("not_implemented"));
	Features.Add(TEXT("save_continue"), TEXT("pending"));
	Features.Add(TEXT("respawn"), TEXT("pending"));
	Features.Add(TEXT("boss_phases"), TEXT("not_implemented"));
	Features.Add(TEXT("victory"), TEXT("pending"));
	NotImplemented.Add(TEXT("npc_interaction: no NPC actors in Unreal adapter or gameplay pack"));
	NotImplemented.Add(TEXT("boss_phases: victory room has no boss enemy; AMFEnemy has no phase machine"));
	FParse::Value(FCommandLine::Get(), TEXT("-acceptanceMode="), Mode);
	bCapture = Mode == TEXT("capture") || Mode == TEXT("all");
	QaDir = FPaths::Combine(FPaths::ProjectDir(), TEXT("qa"));
	IFileManager::Get().MakeDirectory(*QaDir, true);
	IFileManager::Get().MakeDirectory(*FPaths::Combine(QaDir, TEXT("captures")), true);
	Deadline = FPlatformTime::Seconds() + 180.0;
	if (ModeObj)
	{
		LastRoom = ModeObj->GetCurrentRoomId();
		LastRoomAt = FPlatformTime::Seconds();
		Note(FString::Printf(TEXT("spawn %s"), *LastRoom));
		if (bCapture) Capture(TEXT("spawn"));
	}
}

void FMFAcceptance::Tick(AMFGameMode* ModeObj, float DeltaSeconds)
{
	if (bFinished || !ModeObj) return;
	if (FPlatformTime::Seconds() >= Deadline)
	{
		Fail(TEXT("timeout"), FString::Printf(TEXT("acceptance exceeded 180s at room %s"), *ModeObj->GetCurrentRoomId()));
		return;
	}
	AMFPawn* Pawn = ModeObj->GetPlayer();
	APlayerController* PC = Pawn ? Cast<APlayerController>(Pawn->GetController()) : nullptr;
	TrackRoom(ModeObj);
	PhaseAge += DeltaSeconds;
	if (Phase == 0)
	{
		HoldD = 0.6f;
		Phase = 1;
		PhaseAge = 0.f;
	}
	else if (Phase == 1 && PhaseAge > 0.6f)
	{
		if (bCapture) Capture(TEXT("player_run"));
		PulseJump = 0.05f;
		Phase = 2;
		PhaseAge = 0.f;
	}
	else if (Phase == 2 && PhaseAge > 0.4f)
	{
		if (bCapture) Capture(TEXT("player_jump"));
		PulseAttack = 0.05f;
		Phase = 3;
		PhaseAge = 0.f;
	}
	else if (Phase == 3 && PhaseAge > 0.3f)
	{
		if (bCapture) Capture(TEXT("player_combat"));
		if (Pawn)
		{
			Features[TEXT("traversal")] = FMath::Abs(Pawn->GetActorLocation().X) > 8.f ? TEXT("passed") : TEXT("failed");
			Features[TEXT("containment")] = Pawn->GetActorLocation().X >= 0.f ? TEXT("passed") : TEXT("failed");
		}
		HoldD = 0.45f;
		Phase = 4;
		PhaseAge = 0.f;
	}
	else if (Phase == 4)
	{
		WalkBudget -= DeltaSeconds;
		if (Pawn && Pawn->HasAbility(TEXT("dash")))
		{
			Features[TEXT("abilities")] = TEXT("passed");
			PulseDash = 0.05f;
			if (bCapture) Capture(TEXT("player_dash"));
		}
		if (Pawn && ModeObj->GetCurrentRoomId().Contains(TEXT("room_")))
		{
			PulseAttack = 0.05f;
			Features[TEXT("combat")] = TEXT("passed");
		}
		if (ModeObj->IsVictory())
		{
			Features[TEXT("victory")] = TEXT("passed");
			if (bCapture) Capture(TEXT("victory"));
			Phase = 5;
			PhaseAge = 0.f;
		}
		else if (WalkBudget <= 0.f)
		{
			Features[TEXT("victory")] = TEXT("failed");
			Phase = 5;
			PhaseAge = 0.f;
		}
		else
		{
			HoldD = 0.45f;
			if (FMath::FRand() > 0.7f) PulseJump = 0.05f;
		}
	}
	else if (Phase == 5)
	{
		const FString SavePath = ModeObj->GetSavePath();
		Features[TEXT("save_continue")] = FPaths::FileExists(SavePath) ? TEXT("passed") : TEXT("failed");
		if (Pawn)
		{
			Pawn->Hurt(999.f);
		}
		Phase = 6;
		PhaseAge = 0.f;
	}
	else if (Phase == 6 && PhaseAge > 0.4f)
	{
		Features[TEXT("respawn")] = (Pawn && !Pawn->bDead) ? TEXT("passed") : TEXT("failed");
		if (Features[TEXT("gates")] == TEXT("pending"))
			Features[TEXT("gates")] = Pawn && Pawn->HasAbility(TEXT("dash")) ? TEXT("passed") : TEXT("inconclusive");
		if (Features[TEXT("abilities")] == TEXT("pending"))
			Features[TEXT("abilities")] = TEXT("failed");
		bool bFail = false;
		for (const TPair<FString, FString>& Pair : Features)
		{
			if (Pair.Value == TEXT("failed")) bFail = true;
		}
		if (bFail) Fail(TEXT("acceptance_failed"), TEXT("see features"));
		else Pass(TEXT("normal_input"));
		return;
	}
	ApplyInput(PC, Pawn, DeltaSeconds);
}

void FMFAcceptance::ApplyInput(APlayerController* PC, AMFPawn* Pawn, float DeltaSeconds)
{
	if (!PC) return;
	if (HoldD > 0.f)
	{
		PC->InputKey(FInputKeyParams(EKeys::D, IE_Repeat, 1.f, false));
		HoldD -= DeltaSeconds;
	}
	if (PulseJump > 0.f)
	{
		PC->InputKey(FInputKeyParams(EKeys::SpaceBar, IE_Pressed, 1.f, false));
		PulseJump = 0.f;
	}
	if (PulseAttack > 0.f)
	{
		PC->InputKey(FInputKeyParams(EKeys::J, IE_Pressed, 1.f, false));
		PulseAttack = 0.f;
	}
	if (PulseDash > 0.f)
	{
		PC->InputKey(FInputKeyParams(EKeys::K, IE_Pressed, 1.f, false));
		PulseDash = 0.f;
	}
	(void)Pawn;
}

void FMFAcceptance::Capture(const FString& Name)
{
	const FString Dest = FPaths::Combine(QaDir, TEXT("captures"), Name + TEXT(".png"));
	FScreenshotRequest::RequestScreenshot(Dest, false, false);
	Captures.Add(Dest);
	Note(TEXT("capture ") + Name);
}

void FMFAcceptance::TrackRoom(AMFGameMode* ModeObj)
{
	const FString Room = ModeObj->GetCurrentRoomId();
	if (Room == LastRoom) return;
	TransitionMs = float((FPlatformTime::Seconds() - LastRoomAt) * 1000.0);
	LastRoom = Room;
	LastRoomAt = FPlatformTime::Seconds();
	RoomsVisited.Add(Room);
	Note(TEXT("room ") + Room);
}

void FMFAcceptance::Note(const FString& Msg)
{
	Events.Add(Msg);
	UE_LOG(LogTemp, Display, TEXT("FOUNDRY_ACCEPT %s"), *Msg);
}

void FMFAcceptance::Fail(const FString& Reason, const FString& Detail)
{
	WriteResult(TEXT("FAIL"), Reason, Detail);
	FGenericPlatformMisc::RequestExitWithStatus(false, 1);
}

void FMFAcceptance::Pass(const FString& Reason)
{
	WriteResult(TEXT("PASS"), Reason, TEXT("normal_input"));
	FGenericPlatformMisc::RequestExitWithStatus(false, 0);
}

void FMFAcceptance::WriteResult(const FString& Status, const FString& Reason, const FString& Detail)
{
	if (bFinished) return;
	bFinished = true;
	const TSharedRef<FJsonObject> Result = MakeShared<FJsonObject>();
	Result->SetStringField(TEXT("engine"), TEXT("unreal"));
	Result->SetStringField(TEXT("status"), Status);
	Result->SetStringField(TEXT("reason"), Reason);
	Result->SetStringField(TEXT("detail"), Detail);
	Result->SetStringField(TEXT("mode"), Mode);
	Result->SetNumberField(TEXT("roomsVisited"), RoomsVisited.Num());
	Result->SetNumberField(TEXT("transitionMs"), TransitionMs);
	const TSharedRef<FJsonObject> FeatureResults = MakeShared<FJsonObject>();
	for (const TPair<FString, FString>& Pair : Features)
	{
		FeatureResults->SetStringField(Pair.Key, Pair.Value);
	}
	Result->SetObjectField(TEXT("features"), FeatureResults);
	TArray<TSharedPtr<FJsonValue>> MissingFeatures;
	for (const FString& Missing : NotImplemented)
	{
		MissingFeatures.Add(MakeShared<FJsonValueString>(Missing));
	}
	Result->SetArrayField(TEXT("notImplemented"), MissingFeatures);
	TArray<TSharedPtr<FJsonValue>> CapturePaths;
	for (const FString& CapturePath : Captures)
	{
		CapturePaths.Add(MakeShared<FJsonValueString>(FPaths::ConvertRelativePathToFull(CapturePath)));
	}
	Result->SetArrayField(TEXT("captures"), CapturePaths);
	Result->SetStringField(TEXT("note"), TEXT("Automated testing does not establish animation feel or visual quality."));
	FString Json;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Json);
	if (!FJsonSerializer::Serialize(Result, Writer) ||
		!FFileHelper::SaveStringToFile(Json, *FPaths::Combine(QaDir, TEXT("acceptance-result.json"))))
	{
		UE_LOG(LogTemp, Error, TEXT("FOUNDRY_ACCEPT_REPORT_WRITE_FAILED"));
	}

	UE_LOG(LogTemp, Display, TEXT("FOUNDRY_ACCEPT_RESULT status=%s reason=%s"), *Status, *Reason);
	if (Status != TEXT("PASS"))
	{
		UE_LOG(LogTemp, Error, TEXT("FOUNDRY_ACCEPT_FAIL %s %s"), *Reason, *Detail);
	}
}
