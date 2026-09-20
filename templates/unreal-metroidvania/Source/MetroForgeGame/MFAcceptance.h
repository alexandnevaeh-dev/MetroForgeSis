#pragma once

#include "CoreMinimal.h"

class AMFGameMode;
class AMFPawn;
class APlayerController;

struct FMFAcceptance
{
	FString Mode = TEXT("normal_input");
	FString QaDir;
	double Deadline = 0.0;
	bool bFinished = false;
	bool bCapture = false;
	TSet<FString> RoomsVisited;
	TMap<FString, FString> Features;
	TArray<FString> NotImplemented;
	TArray<FString> Captures;
	TArray<FString> Events;
	FString LastRoom;
	double LastRoomAt = 0.0;
	float TransitionMs = -1.f;
	int32 PerfFrames = 0;
	float PerfDt = 0.f;
	float HoldD = 0.f;
	float PulseJump = 0.f;
	float PulseAttack = 0.f;
	float PulseDash = 0.f;
	float WalkBudget = 90.f;
	int32 Phase = 0;
	float PhaseAge = 0.f;

	void Begin(AMFGameMode* ModeObj);
	void Tick(AMFGameMode* ModeObj, float DeltaSeconds);

private:
	void Note(const FString& Msg);
	void Fail(const FString& Reason, const FString& Detail);
	void Pass(const FString& Reason);
	void WriteResult(const FString& Status, const FString& Reason, const FString& Detail);
	void ApplyInput(APlayerController* PC, AMFPawn* Pawn, float DeltaSeconds);
	void Capture(const FString& Name);
	void TrackRoom(AMFGameMode* ModeObj);
};
