#include "MFEnemy.h"
#include "MFPawn.h"
#include "Components/BoxComponent.h"
#include "PaperSpriteComponent.h"
#include "Engine/World.h"

AMFEnemy::AMFEnemy()
{
	PrimaryActorTick.bCanEverTick = true;
	Collision = CreateDefaultSubobject<UBoxComponent>(TEXT("Collision"));
	RootComponent = Collision;
	Collision->SetBoxExtent(FVector(14.f, 8.f, 14.f));
	Collision->SetCollisionProfileName(TEXT("Pawn"));
	Collision->SetGenerateOverlapEvents(true);

	Sprite = CreateDefaultSubobject<UPaperSpriteComponent>(TEXT("Sprite"));
	Sprite->SetupAttachment(RootComponent);
	Sprite->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AMFEnemy::Configure(float InHealth, float InDamage, float InWalk)
{
	Health = InHealth;
	Damage = InDamage;
	WalkSpeed = InWalk;
}

void AMFEnemy::LoadSprites(const FMFPaperAtlas& Atlas)
{
	AtlasCopy = Atlas;
	bHasAtlas = true;
	PlayClip(TEXT("idle"), true);
}

void AMFEnemy::BindPlayer(AMFPawn* InPlayer)
{
	Player = InPlayer;
}

void AMFEnemy::PlayClip(const FString& Clip, bool bRestart)
{
	if (CurrentClip == Clip && !bRestart) return;
	CurrentClip = Clip;
	FrameIndex = 0;
	FrameAge = 0.f;
	ApplyFrame();
}

void AMFEnemy::ApplyFrame()
{
	if (!bHasAtlas) return;
	if (UPaperSprite* Paper = AtlasCopy.Frame(CurrentClip, FrameIndex))
	{
		Sprite->SetSprite(Paper);
	}
	Sprite->SetRelativeScale3D(FVector(bFacingRight ? 1.f : -1.f, 1.f, 1.f));
}

FHitResult AMFEnemy::Sweep(const FVector& Delta) const
{
	FHitResult Hit;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(MFEnemySweep), false, this);
	GetWorld()->SweepSingleByChannel(Hit, GetActorLocation(), GetActorLocation() + Delta, FQuat::Identity, ECC_WorldStatic, Collision->GetCollisionShape(), Params);
	return Hit;
}

void AMFEnemy::Hurt(float Amount)
{
	if (bDead) return;
	Health -= Amount;
	PlayClip(TEXT("hurt"), true);
	if (Health <= 0.f)
	{
		bDead = true;
		PlayClip(TEXT("death"), true);
		SetLifeSpan(0.6f);
	}
}

void AMFEnemy::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bDead) return;
	AttackCooldown = FMath::Max(0.f, AttackCooldown - DeltaSeconds);

	if (Player && !Player->bDead)
	{
		const float DeltaX = Player->GetActorLocation().X - GetActorLocation().X;
		bFacingRight = DeltaX >= 0.f;
		if (FMath::Abs(DeltaX) < 42.f && AttackCooldown <= 0.f)
		{
			AttackCooldown = 0.8f;
			PlayClip(TEXT("attack"), true);
			Player->Hurt(Damage);
		}
		else
		{
			Velocity.X = (bFacingRight ? 1.f : -1.f) * WalkSpeed;
			PlayClip(TEXT("walk"));
		}
	}
	else
	{
		Velocity.X = 0.f;
		PlayClip(TEXT("idle"));
	}

	Velocity.Z -= 980.f * DeltaSeconds;
	FHitResult HitX = Sweep(FVector(Velocity.X * DeltaSeconds, 0.f, 0.f));
	if (!HitX.bBlockingHit) AddActorWorldOffset(FVector(Velocity.X * DeltaSeconds, 0.f, 0.f), true);
	else Velocity.X = 0.f;
	FHitResult HitZ = Sweep(FVector(0.f, 0.f, Velocity.Z * DeltaSeconds));
	if (HitZ.bBlockingHit)
	{
		if (Velocity.Z < 0.f) Velocity.Z = 0.f;
	}
	else
	{
		AddActorWorldOffset(FVector(0.f, 0.f, Velocity.Z * DeltaSeconds), true);
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
}
