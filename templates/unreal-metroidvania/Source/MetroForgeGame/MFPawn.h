#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "MFPaperAtlas.h"
#include "MFPawn.generated.h"

class UPaperSpriteComponent;
class UBoxComponent;
class UCameraComponent;

UCLASS()
class METROFORGEGAME_API AMFPawn : public APawn
{
	GENERATED_BODY()

public:
	AMFPawn();
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	void Configure(float InGravity, float InWalk, float InRun, float InJumpHeight, float InCoyote, float InMaxFall, float InDashSpeed, float InDashDuration, float InDashCooldown);
	void LoadSprites(const FMFPaperAtlas& Atlas);
	void GrantAbility(const FString& Id);
	bool HasAbility(const FString& Id) const { return Abilities.Contains(Id); }
	void Hurt(float Amount);
	void TeleportFeet(const FVector& Feet);
	FVector FeetLocation() const;
	float Health = 5.f;
	bool bDead = false;
	bool bVictory = false;
	TSet<FString> Abilities;

	FSimpleDelegate OnCheckpoint;
	FSimpleDelegate OnVictory;
	TFunction<void(const FString&)> OnDoor;
	TFunction<void(const FString&)> OnPickup;

protected:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UBoxComponent> Collision;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UPaperSpriteComponent> Sprite;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> Camera;

	FMFPaperAtlas AtlasCopy;
	bool bHasAtlas = false;
	FString CurrentClip;
	int32 FrameIndex = 0;
	float FrameAge = 0.f;
	float MoveAxis = 0.f;
	bool bJumpQueued = false;
	bool bAttackQueued = false;
	bool bDashQueued = false;
	bool bRun = false;
	bool bFacingRight = true;
	bool bGrounded = false;
	float Coyote = 0.f;
	float Invuln = 0.f;
	float AttackCooldown = 0.f;
	float DashTime = 0.f;
	float DashCooldown = 0.f;
	float DoorLock = 0.f;
	FVector Velocity = FVector::ZeroVector;
	float Gravity = 980.f;
	float WalkSpeed = 200.f;
	float RunSpeed = 350.f;
	float JumpHeight = 120.f;
	float CoyoteMax = 0.12f;
	float MaxFall = 650.f;
	float DashSpeed = 500.f;
	float DashDuration = 0.15f;
	float DashCooldownMax = 0.5f;

	void PlayClip(const FString& Clip, bool bRestart = false);
	void ApplyFrame();
	FHitResult Sweep(const FVector& Delta) const;
};
