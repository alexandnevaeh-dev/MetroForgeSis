#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MFPaperAtlas.h"
#include "MFEnemy.generated.h"

class UBoxComponent;
class UPaperSpriteComponent;
class AMFPawn;

UCLASS()
class METROFORGEGAME_API AMFEnemy : public AActor
{
	GENERATED_BODY()

public:
	AMFEnemy();
	virtual void Tick(float DeltaSeconds) override;

	void Configure(float InHealth, float InDamage, float InWalk);
	void LoadSprites(const FMFPaperAtlas& Atlas);
	void Hurt(float Amount);
	void BindPlayer(AMFPawn* InPlayer);

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UBoxComponent> Collision;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPaperSpriteComponent> Sprite;

	float Health = 30.f;
	float Damage = 8.f;

protected:
	TObjectPtr<AMFPawn> Player;
	FMFPaperAtlas AtlasCopy;
	bool bHasAtlas = false;
	FString CurrentClip;
	int32 FrameIndex = 0;
	float FrameAge = 0.f;
	float WalkSpeed = 40.f;
	float AttackCooldown = 0.f;
	bool bDead = false;
	bool bFacingRight = false;
	FVector Velocity = FVector::ZeroVector;

	void PlayClip(const FString& Clip, bool bRestart = false);
	void ApplyFrame();
	FHitResult Sweep(const FVector& Delta) const;
};
