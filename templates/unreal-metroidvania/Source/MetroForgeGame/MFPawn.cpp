#include "MFPawn.h"
#include "MFEnemy.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "EnhancedInputComponent.h"
#include "PaperSpriteComponent.h"
#include "Engine/OverlapResult.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"

AMFPawn::AMFPawn()
{
	PrimaryActorTick.bCanEverTick = true;
	Collision = CreateDefaultSubobject<UBoxComponent>(TEXT("Collision"));
	RootComponent = Collision;
	Collision->SetBoxExtent(FVector(12.f, 8.f, 24.f));
	Collision->SetCollisionProfileName(TEXT("Pawn"));
	Collision->SetGenerateOverlapEvents(true);

	Sprite = CreateDefaultSubobject<UPaperSpriteComponent>(TEXT("Sprite"));
	Sprite->SetupAttachment(RootComponent);
	Sprite->SetRelativeLocation(FVector(0.f, 0.f, 0.f));
	Sprite->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(RootComponent);
	Camera->SetProjectionMode(ECameraProjectionMode::Orthographic);
	Camera->SetOrthoWidth(640.f);
	Camera->SetRelativeLocation(FVector(0.f, 500.f, 40.f));
	Camera->SetRelativeRotation(FRotator(0.f, -90.f, 0.f));
	bUseControllerRotationPitch = false;
	bUseControllerRotationYaw = false;
	bUseControllerRotationRoll = false;
}

void AMFPawn::Configure(float InGravity, float InWalk, float InRun, float InJumpHeight, float InCoyote, float InMaxFall, float InDashSpeed, float InDashDuration, float InDashCooldown)
{
	Gravity = InGravity;
	WalkSpeed = InWalk;
	RunSpeed = InRun;
	JumpHeight = InJumpHeight;
	CoyoteMax = InCoyote;
	MaxFall = InMaxFall;
	DashSpeed = InDashSpeed;
	DashDuration = InDashDuration;
	DashCooldownMax = InDashCooldown;
}

void AMFPawn::LoadSprites(const FMFPaperAtlas& Atlas)
{
	AtlasCopy = Atlas;
	bHasAtlas = true;
	PlayClip(TEXT("idle"), true);
}

void AMFPawn::GrantAbility(const FString& Id)
{
	if (!Id.IsEmpty())
	{
		Abilities.Add(Id);
	}
}

void AMFPawn::TeleportFeet(const FVector& Feet)
{
	SetActorLocation(Feet + FVector(0.f, 0.f, 24.f));
	Velocity = FVector::ZeroVector;
}

FVector AMFPawn::FeetLocation() const
{
	return GetActorLocation() - FVector(0.f, 0.f, 24.f);
}

void AMFPawn::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);
}

void AMFPawn::PlayClip(const FString& Clip, bool bRestart)
{
	if (CurrentClip == Clip && !bRestart)
	{
		return;
	}
	CurrentClip = Clip;
	FrameIndex = 0;
	FrameAge = 0.f;
	ApplyFrame();
}

void AMFPawn::ApplyFrame()
{
	if (!bHasAtlas)
	{
		return;
	}
	if (UPaperSprite* Paper = AtlasCopy.Frame(CurrentClip, FrameIndex))
	{
		Sprite->SetSprite(Paper);
	}
	else if (UPaperSprite* Idle = AtlasCopy.Frame(TEXT("idle"), 0))
	{
		Sprite->SetSprite(Idle);
	}
	Sprite->SetRelativeScale3D(FVector(bFacingRight ? 1.f : -1.f, 1.f, 1.f));
}

FHitResult AMFPawn::Sweep(const FVector& Delta) const
{
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(MFPawnSweep), false, this);
	GetWorld()->SweepSingleByChannel(Hit, GetActorLocation(), GetActorLocation() + Delta, FQuat::Identity, ECC_WorldStatic, Collision->GetCollisionShape(), Params);
	return Hit;
}

void AMFPawn::Hurt(float Amount)
{
	if (bDead || Invuln > 0.f)
	{
		return;
	}
	Health -= Amount;
	Invuln = 20.f / 60.f;
	PlayClip(TEXT("hurt"), true);
	if (Health <= 0.f)
	{
		bDead = true;
		PlayClip(TEXT("death"), true);
	}
}

void AMFPawn::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	APlayerController* PC = Cast<APlayerController>(GetController());
	MoveAxis = 0.f;
	bRun = false;
	if (PC)
	{
		if (PC->IsInputKeyDown(EKeys::A) || PC->IsInputKeyDown(EKeys::Left)) MoveAxis -= 1.f;
		if (PC->IsInputKeyDown(EKeys::D) || PC->IsInputKeyDown(EKeys::Right)) MoveAxis += 1.f;
		bRun = PC->IsInputKeyDown(EKeys::LeftShift);
		if (PC->WasInputKeyJustPressed(EKeys::SpaceBar) || PC->WasInputKeyJustPressed(EKeys::W) || PC->WasInputKeyJustPressed(EKeys::Up))
			bJumpQueued = true;
		if (PC->WasInputKeyJustPressed(EKeys::J) || PC->WasInputKeyJustPressed(EKeys::Z))
			bAttackQueued = true;
		if (PC->WasInputKeyJustPressed(EKeys::K))
			bDashQueued = true;
	}

	if (MoveAxis != 0.f)
	{
		bFacingRight = MoveAxis > 0.f;
	}

	Invuln = FMath::Max(0.f, Invuln - DeltaSeconds);
	AttackCooldown = FMath::Max(0.f, AttackCooldown - DeltaSeconds);
	DashCooldown = FMath::Max(0.f, DashCooldown - DeltaSeconds);
	DoorLock = FMath::Max(0.f, DoorLock - DeltaSeconds);
	if (DashTime > 0.f) DashTime -= DeltaSeconds;

	if (bGrounded) Coyote = CoyoteMax;
	else Coyote = FMath::Max(0.f, Coyote - DeltaSeconds);

	if (bDashQueued && HasAbility(TEXT("dash")) && DashCooldown <= 0.f)
	{
		DashTime = DashDuration;
		DashCooldown = DashCooldownMax;
		Velocity.X = (bFacingRight ? 1.f : -1.f) * DashSpeed;
		Velocity.Z = 0.f;
		PlayClip(TEXT("dash"), true);
	}
	bDashQueued = false;

	if (bAttackQueued && AttackCooldown <= 0.f)
	{
		AttackCooldown = 0.4f * 0.75f;
		PlayClip(TEXT("attack"), true);
		TArray<FOverlapResult> Overlaps;
		FCollisionShape Shape = FCollisionShape::MakeBox(FVector(18.f, 12.f, 14.f));
		FVector HitLoc = GetActorLocation() + FVector((bFacingRight ? 28.f : -28.f), 0.f, 0.f);
		GetWorld()->OverlapMultiByChannel(Overlaps, HitLoc, FQuat::Identity, ECC_Pawn, Shape);
		for (const FOverlapResult& Hit : Overlaps)
		{
			if (AMFEnemy* Enemy = Cast<AMFEnemy>(Hit.GetActor()))
			{
				Enemy->Hurt(10.f);
			}
		}
	}
	bAttackQueued = false;

	const float Target = MoveAxis * (bRun ? RunSpeed : WalkSpeed);
	if (DashTime <= 0.f)
	{
		Velocity.X = FMath::FInterpConstantTo(Velocity.X, Target, DeltaSeconds, bGrounded ? 1800.f : 900.f);
	}
	Velocity.Z -= Gravity * DeltaSeconds;
	Velocity.Z = FMath::Max(-MaxFall, Velocity.Z);

	if (bJumpQueued && Coyote > 0.f)
	{
		Velocity.Z = FMath::Sqrt(2.f * Gravity * JumpHeight);
		Coyote = 0.f;
		bGrounded = false;
		PlayClip(TEXT("jump_start"), true);
	}
	bJumpQueued = false;

	bGrounded = false;
	const FVector Delta = Velocity * DeltaSeconds;
	FHitResult HitX = Sweep(FVector(Delta.X, 0.f, 0.f));
	if (HitX.bBlockingHit)
	{
		AddActorWorldOffset(FVector(Delta.X * HitX.Time, 0.f, 0.f), true);
		Velocity.X = 0.f;
	}
	else
	{
		AddActorWorldOffset(FVector(Delta.X, 0.f, 0.f), true);
	}
	FHitResult HitZ = Sweep(FVector(0.f, 0.f, Delta.Z));
	if (HitZ.bBlockingHit)
	{
		AddActorWorldOffset(FVector(0.f, 0.f, Delta.Z * HitZ.Time), true);
		if (Delta.Z < 0.f)
		{
			bGrounded = true;
			Velocity.Z = 0.f;
		}
		else
		{
			Velocity.Z = 0.f;
		}
	}
	else
	{
		AddActorWorldOffset(FVector(0.f, 0.f, Delta.Z), true);
	}

	if (bHasAtlas && AttackCooldown <= 0.f && DashTime <= 0.f)
	{
		if (!bGrounded) PlayClip(Velocity.Z > 20.f ? TEXT("jump") : TEXT("fall"));
		else if (FMath::Abs(Velocity.X) > 20.f) PlayClip(bRun ? TEXT("run") : TEXT("walk"));
		else PlayClip(TEXT("idle"));
	}
	if (bHasAtlas)
	{
		if (const FMFSpriteClip* Clip = AtlasCopy.Find(CurrentClip))
		{
			FrameAge += DeltaSeconds;
			const float FrameTime = 1.f / FMath::Max(1.f, Clip->Fps);
			while (FrameAge >= FrameTime)
			{
				FrameAge -= FrameTime;
				FrameIndex++;
				if (FrameIndex >= Clip->Frames.Num())
				{
					FrameIndex = Clip->bLoop ? 0 : Clip->Frames.Num() - 1;
				}
			}
			ApplyFrame();
		}
	}

	TArray<FOverlapResult> Overlaps;
	GetWorld()->OverlapMultiByChannel(Overlaps, GetActorLocation(), FQuat::Identity, ECC_WorldDynamic, Collision->GetCollisionShape());
	for (const FOverlapResult& Hit : Overlaps)
	{
		AActor* Other = Hit.GetActor();
		if (!Other) continue;
		if (Other->ActorHasTag(TEXT("Checkpoint")))
		{
			OnCheckpoint.ExecuteIfBound();
		}
		else if (Other->ActorHasTag(TEXT("Victory")))
		{
			bVictory = true;
			OnVictory.ExecuteIfBound();
		}
		else
		{
			for (const FName& Tag : Other->Tags)
			{
				const FString Name = Tag.ToString();
				if (Name.StartsWith(TEXT("Pickup_")) && OnPickup)
				{
					OnPickup(Name.RightChop(7));
					Other->Destroy();
					break;
				}
				if (Name.StartsWith(TEXT("Door_")) && OnDoor && DoorLock <= 0.f)
				{
					DoorLock = 0.35f;
					OnDoor(Name);
					break;
				}
			}
		}
	}
}
