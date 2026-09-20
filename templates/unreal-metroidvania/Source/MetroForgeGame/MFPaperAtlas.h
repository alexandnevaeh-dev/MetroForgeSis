#pragma once

#include "CoreMinimal.h"
#include "PaperSprite.h"

struct FMFSpriteClip
{
	FString Clip;
	TArray<TObjectPtr<UPaperSprite>> Frames;
	float Fps = 8.f;
	bool bLoop = true;
};

class METROFORGEGAME_API FMFPaperAtlas
{
public:
	void LoadPngSheet(UObject* Outer, const FString& AbsPath, const FString& Clip, int32 FrameWidth, int32 FrameHeight, int32 FrameCount, float Fps, bool bLoop, float PivotX, float PivotY);
	const FMFSpriteClip* Find(const FString& Clip) const;
	UPaperSprite* Frame(const FString& Clip, int32 Index) const;

private:
	TMap<FString, FMFSpriteClip> Clips;
	UTexture2D* ImportPng(UObject* Outer, const FString& AbsPath) const;
};
