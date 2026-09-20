#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "MFVolume.generated.h"

class UBoxComponent;

UCLASS()
class METROFORGEGAME_API AMFVolume : public AActor
{
	GENERATED_BODY()

public:
	AMFVolume();

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UBoxComponent> Box;
};
