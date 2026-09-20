#include "MFPaperAtlas.h"
#include "IImageWrapper.h"
#include "IImageWrapperModule.h"
#include "Modules/ModuleManager.h"
#include "PaperSprite.h"
#include "Engine/Texture2D.h"
#include "Misc/FileHelper.h"

UTexture2D* FMFPaperAtlas::ImportPng(UObject* Outer, const FString& AbsPath) const
{
	TArray<uint8> FileData;
	if (!FFileHelper::LoadFileToArray(FileData, *AbsPath))
	{
		return nullptr;
	}
	IImageWrapperModule& ImageWrapperModule = FModuleManager::LoadModuleChecked<IImageWrapperModule>(FName("ImageWrapper"));
	TSharedPtr<IImageWrapper> Png = ImageWrapperModule.CreateImageWrapper(EImageFormat::PNG);
	if (!Png.IsValid() || !Png->SetCompressed(FileData.GetData(), FileData.Num()))
	{
		return nullptr;
	}
	TArray<uint8> Raw;
	if (!Png->GetRaw(ERGBFormat::BGRA, 8, Raw))
	{
		return nullptr;
	}
	UTexture2D* Texture = UTexture2D::CreateTransient(Png->GetWidth(), Png->GetHeight(), PF_B8G8R8A8);
	if (!Texture)
	{
		return nullptr;
	}
	Texture->Filter = TF_Nearest;
	Texture->SRGB = true;
	Texture->CompressionSettings = TC_EditorIcon;
	void* MipData = Texture->GetPlatformData()->Mips[0].BulkData.Lock(LOCK_READ_WRITE);
	FMemory::Memcpy(MipData, Raw.GetData(), Raw.Num());
	Texture->GetPlatformData()->Mips[0].BulkData.Unlock();
	Texture->UpdateResource();
	return Texture;
}

void FMFPaperAtlas::LoadPngSheet(UObject* Outer, const FString& AbsPath, const FString& Clip, int32 FrameWidth, int32 FrameHeight, int32 FrameCount, float Fps, bool bLoop, float PivotX, float PivotY)
{
	UTexture2D* Texture = ImportPng(Outer, AbsPath);
	if (!Texture)
	{
		return;
	}
	FMFSpriteClip& Entry = Clips.FindOrAdd(Clip);
	Entry.Clip = Clip;
	Entry.Fps = Fps > 0.f ? Fps : 8.f;
	Entry.bLoop = bLoop;
	Entry.Frames.Reset();
	const int32 Count = FMath::Max(1, FrameCount);
	const int32 FW = FMath::Max(1, FrameWidth);
	const int32 FH = FMath::Max(1, FrameHeight);
	for (int32 i = 0; i < Count; i++)
	{
		UPaperSprite* Sprite = NewObject<UPaperSprite>(Outer);
		FSpriteAssetInitParameters Params;
		Params.Texture = Texture;
		Params.Offset = FIntPoint(i * FW, 0);
		Params.Dimension = FIntPoint(FW, FH);
		Params.PixelsPerUnrealUnit = 1.f;
		Sprite->InitializeSprite(Params);
		if (FMath::IsNearlyEqual(PivotY, 0.f) && FMath::IsNearlyEqual(PivotX, 0.5f))
		{
			Sprite->SetPivotMode(ESpritePivotMode::Bottom_Center, FVector2D::ZeroVector);
		}
		else
		{
			Sprite->SetPivotMode(ESpritePivotMode::Custom, FVector2D(FW * PivotX, FH * PivotY));
		}
		Entry.Frames.Add(Sprite);
	}
}

const FMFSpriteClip* FMFPaperAtlas::Find(const FString& Clip) const
{
	return Clips.Find(Clip);
}

UPaperSprite* FMFPaperAtlas::Frame(const FString& Clip, int32 Index) const
{
	const FMFSpriteClip* Found = Find(Clip);
	if (!Found || Found->Frames.Num() == 0)
	{
		return nullptr;
	}
	return Found->Frames[FMath::Clamp(Index, 0, Found->Frames.Num() - 1)];
}
