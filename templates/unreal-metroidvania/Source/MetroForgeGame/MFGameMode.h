#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "MFPaperAtlas.h"
#include "MFAcceptance.h"
#include "Dom/JsonObject.h"
#include "MFGameMode.generated.h"

class AMFPawn;

UCLASS()
class METROFORGEGAME_API AMFGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AMFGameMode();
	virtual void StartPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	FString GetCurrentRoomId() const { return CurrentRoomId; }
	AMFPawn* GetPlayer() const { return Player; }
	bool IsVictory() const { return bVictory; }
	FString GetSavePath() const { return SavePath; }

private:
	FMFAcceptance Acceptance;
	bool bRunAcceptance = false;

	FString ContentRoot;
	FString SavePath;
	FString CurrentRoomId;
	TSharedPtr<FJsonObject> Root;
	TObjectPtr<AMFPawn> Player;
	TArray<TObjectPtr<AActor>> RoomActors;
	FMFPaperAtlas PlayerAtlas;
	TMap<FString, FMFPaperAtlas> EnemyAtlases;
	bool bVictory = false;
	FString SavedAbilities;

	FVector FromGodot(float X, float Y, float RoomHeight) const;
	void LoadPack();
	void LoadRoom(const FString& RoomId, const FVector& Spawn, bool bAbsolute);
	void ClearRoom();
	AActor* SpawnSolid(const TSharedPtr<FJsonObject>& Rect, float RoomHeight);
	void WriteSave();
	void RestoreSave(FString& OutRoom, FVector& OutSpawn);
};
