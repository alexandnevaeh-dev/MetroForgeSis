#include "MFGameMode.h"
#include "MFPawn.h"
#include "MFEnemy.h"
#include "MFVolume.h"
#include "Camera/CameraComponent.h"
#include "Components/BoxComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/Engine.h"
#include "Engine/World.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "PaperSpriteComponent.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

AMFGameMode::AMFGameMode()
{
	DefaultPawnClass = AMFPawn::StaticClass();
	PrimaryActorTick.bCanEverTick = true;
}

void AMFGameMode::StartPlay()
{
	Super::StartPlay();
	ContentRoot = FPaths::Combine(FPaths::ProjectContentDir(), TEXT("Raw"));
	SavePath = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("metroforge_save.json"));
	LoadPack();
	bRunAcceptance = FParse::Param(FCommandLine::Get(), TEXT("MetroForgeAcceptance"));
	if (bRunAcceptance)
	{
		Acceptance.Begin(this);
	}
}

FVector AMFGameMode::FromGodot(float X, float Y, float RoomHeight) const
{
	return FVector(X, 0.f, RoomHeight - Y);
}

void AMFGameMode::LoadPack()
{
	const FString JsonPath = FPaths::Combine(ContentRoot, TEXT("gameplay.json"));
	FString Json;
	if (!FFileHelper::LoadFileToString(Json, *JsonPath))
	{
		UE_LOG(LogTemp, Error, TEXT("Missing Content/Raw/gameplay.json"));
		return;
	}
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
	TSharedPtr<FJsonObject> Parsed;
	if (!FJsonSerializer::Deserialize(Reader, Parsed) || !Parsed.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("Invalid gameplay.json"));
		return;
	}
	Root = Parsed;
	if (Root->HasTypedField<EJson::Array>(TEXT("sprites")))
	{
		for (const TSharedPtr<FJsonValue>& Value : Root->GetArrayField(TEXT("sprites")))
		{
			const TSharedPtr<FJsonObject> S = Value->AsObject();
			if (!S.IsValid()) continue;
			const FString Owner = S->GetStringField(TEXT("ownerId"));
			const FString Rel = S->GetStringField(TEXT("relativePath"));
			const FString Abs = FPaths::Combine(ContentRoot, Rel);
			FMFPaperAtlas& Atlas = Owner == TEXT("player") ? PlayerAtlas : EnemyAtlases.FindOrAdd(Owner);
			Atlas.LoadPngSheet(this, Abs, S->GetStringField(TEXT("clip")),
				S->GetIntegerField(TEXT("frameWidth")), S->GetIntegerField(TEXT("frameHeight")),
				S->GetIntegerField(TEXT("frameCount")), S->GetNumberField(TEXT("fps")),
				S->GetBoolField(TEXT("loop")), S->GetNumberField(TEXT("pivotX")), S->GetNumberField(TEXT("pivotY")));
		}
	}

	FString RoomId = Root->GetStringField(TEXT("startRoomId"));
	FVector Spawn = FVector::ZeroVector;
	RestoreSave(RoomId, Spawn);
	LoadRoom(RoomId, Spawn, true);
}

void AMFGameMode::RestoreSave(FString& OutRoom, FVector& OutSpawn)
{
	FString Json;
	if (!FFileHelper::LoadFileToString(Json, *SavePath))
	{
		return;
	}
	TSharedPtr<FJsonObject> Save;
	const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Json);
	if (!FJsonSerializer::Deserialize(Reader, Save) || !Save.IsValid())
	{
		return;
	}
	OutRoom = Save->GetStringField(TEXT("roomId"));
	OutSpawn = FVector(Save->GetNumberField(TEXT("x")), 0.f, Save->GetNumberField(TEXT("z")));
	bVictory = Save->GetBoolField(TEXT("victory"));
	SavedAbilities = Save->GetStringField(TEXT("abilities"));
}

void AMFGameMode::WriteSave()
{
	if (!Player) return;
	TSharedRef<FJsonObject> Save = MakeShared<FJsonObject>();
	Save->SetStringField(TEXT("roomId"), CurrentRoomId);
	const FVector Feet = Player->FeetLocation();
	Save->SetNumberField(TEXT("x"), Feet.X);
	Save->SetNumberField(TEXT("z"), Feet.Z);
	Save->SetBoolField(TEXT("victory"), bVictory || Player->bVictory);
	FString Abilities;
	for (const FString& Id : Player->Abilities)
	{
		if (!Abilities.IsEmpty()) Abilities += TEXT(",");
		Abilities += Id;
	}
	Save->SetStringField(TEXT("abilities"), Abilities);
	FString Out;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Out);
	FJsonSerializer::Serialize(Save, Writer);
	FFileHelper::SaveStringToFile(Out, *SavePath);
}

void AMFGameMode::ClearRoom()
{
	for (AActor* Actor : RoomActors)
	{
		if (IsValid(Actor)) Actor->Destroy();
	}
	RoomActors.Reset();
}

AActor* AMFGameMode::SpawnSolid(const TSharedPtr<FJsonObject>& Rect, float RoomHeight)
{
	AMFVolume* Actor = GetWorld()->SpawnActor<AMFVolume>();
	const float W = Rect->GetNumberField(TEXT("width"));
	const float H = Rect->GetNumberField(TEXT("height"));
	const float X = Rect->GetNumberField(TEXT("x"));
	const float Y = Rect->GetNumberField(TEXT("y"));
	Actor->Box->SetBoxExtent(FVector(W * 0.5f, 12.f, H * 0.5f));
	Actor->Box->SetCollisionObjectType(ECC_WorldStatic);
	Actor->SetActorLocation(FromGodot(X + W * 0.5f, Y + H * 0.5f, RoomHeight));
	return Actor;
}

void AMFGameMode::LoadRoom(const FString& RoomId, const FVector& Spawn, bool bAbsolute)
{
	if (!Root.IsValid()) return;
	TSharedPtr<FJsonObject> Room;
	for (const TSharedPtr<FJsonValue>& Value : Root->GetArrayField(TEXT("rooms")))
	{
		const TSharedPtr<FJsonObject> Candidate = Value->AsObject();
		if (Candidate.IsValid() && Candidate->GetStringField(TEXT("id")) == RoomId)
		{
			Room = Candidate;
			break;
		}
	}
	if (!Room.IsValid()) return;
	CurrentRoomId = RoomId;
	ClearRoom();
	const float RoomHeight = Room->GetNumberField(TEXT("height"));
	const float RoomWidth = Room->GetNumberField(TEXT("width"));

	for (const TSharedPtr<FJsonValue>& Value : Room->GetArrayField(TEXT("solids")))
	{
		RoomActors.Add(SpawnSolid(Value->AsObject(), RoomHeight));
	}

	auto SpawnTrigger = [&](const FString& Name, const FVector& Loc, const FVector& Extent, ECollisionChannel Channel)
	{
		AMFVolume* Actor = GetWorld()->SpawnActor<AMFVolume>();
		Actor->Tags.Add(*Name);
		Actor->Box->SetBoxExtent(Extent);
		Actor->Box->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
		Actor->Box->SetCollisionObjectType(Channel);
		Actor->Box->SetCollisionResponseToAllChannels(ECR_Overlap);
		Actor->Box->SetGenerateOverlapEvents(true);
		Actor->SetActorLocation(Loc);
		RoomActors.Add(Actor);
		return Actor;
	};

	for (const TSharedPtr<FJsonValue>& Value : Room->GetArrayField(TEXT("doors")))
	{
		const TSharedPtr<FJsonObject> Door = Value->AsObject();
		const FString Target = Door->GetStringField(TEXT("targetRoomId"));
		const FString Req = Door->HasTypedField<EJson::Array>(TEXT("requirements")) && Door->GetArrayField(TEXT("requirements")).Num() > 0
			? Door->GetArrayField(TEXT("requirements"))[0]->AsString()
			: FString();
		AActor* Actor = SpawnTrigger(
			FString::Printf(TEXT("Door_%s_%s"), *Door->GetStringField(TEXT("direction")), *Target),
			FromGodot(Door->GetNumberField(TEXT("x")) + Door->GetNumberField(TEXT("width")) * 0.5f, Door->GetNumberField(TEXT("y")) + Door->GetNumberField(TEXT("height")) * 0.5f, RoomHeight),
			FVector(Door->GetNumberField(TEXT("width")) * 0.5f, 12.f, Door->GetNumberField(TEXT("height")) * 0.5f),
			ECC_WorldDynamic);
		Actor->Tags.Add(*Target);
		if (!Req.IsEmpty()) Actor->Tags.Add(*Req);
	}
	for (const TSharedPtr<FJsonValue>& Value : Room->GetArrayField(TEXT("gates")))
	{
		const TSharedPtr<FJsonObject> Gate = Value->AsObject();
		const FString Req = Gate->GetStringField(TEXT("requiredAbility"));
		if (Player && Player->HasAbility(Req)) continue;
		AActor* Solid = SpawnSolid(Gate, RoomHeight);
		Solid->Tags.Add(*FString::Printf(TEXT("Gate_%s"), *Req));
		RoomActors.Add(Solid);
	}
	TArray<TSharedPtr<FJsonValue>> Pickups;
	if (Room->HasTypedField<EJson::Array>(TEXT("abilityPickups")))
		Pickups = Room->GetArrayField(TEXT("abilityPickups"));
	else if (Room->HasTypedField<EJson::Object>(TEXT("abilityPickup")))
		Pickups.Add(MakeShared<FJsonValueObject>(Room->GetObjectField(TEXT("abilityPickup"))));
	for (const TSharedPtr<FJsonValue>& Entry : Pickups)
	{
		if (!Entry.IsValid() || Entry->Type != EJson::Object) continue;
		const TSharedPtr<FJsonObject> Pickup = Entry->AsObject();
		const FString Id = Pickup->GetStringField(TEXT("id"));
		if (!Id.IsEmpty() && (!Player || !Player->HasAbility(Id)))
		{
			SpawnTrigger(FString::Printf(TEXT("Pickup_%s"), *Id), FromGodot(Pickup->GetNumberField(TEXT("x")), Pickup->GetNumberField(TEXT("y")), RoomHeight), FVector(12.f, 12.f, 12.f), ECC_WorldDynamic);
		}
	}
	if (Room->HasTypedField<EJson::Object>(TEXT("checkpoint")))
	{
		const TSharedPtr<FJsonObject> CP = Room->GetObjectField(TEXT("checkpoint"));
		SpawnTrigger(TEXT("Checkpoint"), FromGodot(CP->GetNumberField(TEXT("x")), CP->GetNumberField(TEXT("y")), RoomHeight), FVector(14.f, 12.f, 24.f), ECC_WorldDynamic);
	}
	if (Room->GetBoolField(TEXT("victory")))
	{
		SpawnTrigger(TEXT("Victory"), FromGodot(RoomWidth * 0.5f, Room->GetNumberField(TEXT("floorTop")) - 40.f, RoomHeight), FVector(24.f, 12.f, 24.f), ECC_WorldDynamic);
	}

	APlayerController* PC = UGameplayStatics::GetPlayerController(this, 0);
	if (!Player)
	{
		Player = Cast<AMFPawn>(PC ? PC->GetPawn() : nullptr);
		if (!Player)
		{
			Player = GetWorld()->SpawnActor<AMFPawn>();
			if (PC) PC->Possess(Player);
		}
		const TSharedPtr<FJsonObject> Movement = Root->GetObjectField(TEXT("movement"));
		Player->Configure(
			Movement->GetNumberField(TEXT("gravity")),
			Movement->GetNumberField(TEXT("walkSpeed")),
			Movement->GetNumberField(TEXT("runSpeed")),
			Movement->GetNumberField(TEXT("jumpHeight")),
			Movement->GetNumberField(TEXT("coyoteTime")),
			Movement->GetNumberField(TEXT("maxFallSpeed")),
			Movement->GetNumberField(TEXT("dashSpeed")),
			Movement->GetNumberField(TEXT("dashDuration")),
			Movement->GetNumberField(TEXT("dashCooldown")));
		Player->LoadSprites(PlayerAtlas);
		if (!SavedAbilities.IsEmpty())
		{
			TArray<FString> Parts;
			SavedAbilities.ParseIntoArray(Parts, TEXT(","), true);
			for (const FString& Id : Parts) Player->GrantAbility(Id);
		}
		Player->OnPickup = [this](const FString& Id)
		{
			if (Player) Player->GrantAbility(Id);
			WriteSave();
		};
		Player->OnDoor = [this](const FString& Name)
		{
			const int32 Under = Name.Find(TEXT("_"), ESearchCase::IgnoreCase, ESearchDir::FromEnd);
			if (Under == INDEX_NONE) return;
			const FString Target = Name.Mid(Under + 1);
			if (AActor* Found = nullptr)
			{
				for (AActor* Actor : RoomActors)
				{
					if (Actor && Actor->ActorHasTag(*Name))
					{
						Found = Actor;
						break;
					}
				}
				if (Found)
				{
					for (const FName& Tag : Found->Tags)
					{
						const FString TagStr = Tag.ToString();
						if (TagStr != Target && Player && !Player->HasAbility(TagStr) && TagStr != TEXT("left") && TagStr != TEXT("right") && TagStr != TEXT("up") && TagStr != TEXT("down"))
						{
							return;
						}
					}
				}
			}
			FVector NextSpawn = FVector::ZeroVector;
			LoadRoom(Target, NextSpawn, false);
		};
		Player->OnCheckpoint.BindUObject(this, &AMFGameMode::WriteSave);
		Player->OnVictory.BindLambda([this]()
		{
			bVictory = true;
			WriteSave();
		});
	}

	FVector Feet = bAbsolute && !Spawn.IsNearlyZero() ? Spawn : FromGodot(Room->GetNumberField(TEXT("spawnX")), Room->GetNumberField(TEXT("spawnY")), RoomHeight);
	Player->TeleportFeet(Feet);
	if (Room->HasTypedField<EJson::Object>(TEXT("enemy")))
	{
		const TSharedPtr<FJsonObject> EnemySpec = Room->GetObjectField(TEXT("enemy"));
		AMFEnemy* Enemy = GetWorld()->SpawnActor<AMFEnemy>();
		Enemy->Configure(
			EnemySpec->HasField(TEXT("health")) ? EnemySpec->GetNumberField(TEXT("health")) : 30.f,
			EnemySpec->HasField(TEXT("damage")) ? EnemySpec->GetNumberField(TEXT("damage")) : 8.f,
			40.f);
		const FString EnemyId = EnemySpec->GetStringField(TEXT("id"));
		if (const FMFPaperAtlas* Atlas = EnemyAtlases.Find(EnemyId))
		{
			Enemy->LoadSprites(*Atlas);
		}
		Enemy->SetActorLocation(FromGodot(EnemySpec->GetNumberField(TEXT("x")), EnemySpec->GetNumberField(TEXT("y")), RoomHeight) + FVector(0.f, 0.f, 14.f));
		Enemy->BindPlayer(Player);
		RoomActors.Add(Enemy);
	}
	if (UCameraComponent* Cam = Player->FindComponentByClass<UCameraComponent>())
	{
		Cam->SetOrthoWidth(FMath::Max(RoomWidth, 320.f));
	}
	WriteSave();
}

void AMFGameMode::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	if (bRunAcceptance)
	{
		Acceptance.Tick(this, DeltaSeconds);
	}
	if (!Player) return;
	const FString Abilities = [&]()
	{
		TArray<FString> Ids;
		for (const FString& Id : Player->Abilities) Ids.Add(Id);
		return FString::Join(Ids, TEXT(","));
	}();
	if (GEngine)
	{
		GEngine->AddOnScreenDebugMessage(1, 0.f, FColor::White,
			FString::Printf(TEXT("%s\nRoom %s  HP %.0f\nAbilities: %s%s"),
				*Root->GetStringField(TEXT("title")), *CurrentRoomId, Player->Health,
				Abilities.IsEmpty() ? TEXT("-") : *Abilities,
				(bVictory || Player->bVictory) ? TEXT("\nVICTORY") : TEXT("")));
	}
}
