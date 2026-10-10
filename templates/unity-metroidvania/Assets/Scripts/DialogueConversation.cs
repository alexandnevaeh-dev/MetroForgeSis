using System;
using System.Collections.Generic;

// Dialogue traversal never silently performs unsupported gameplay actions.
public sealed class DialogueConversation
{
    readonly Dictionary<string, GameplayDialogue> blocks = new Dictionary<string, GameplayDialogue>();
    GameplayDialogue current;
    int index;
    public GameplayDialogueLine Line => current != null ? current.lines[index] : null;
    public bool IsOpen => current != null;
    public DialogueConversation(GameplayDialogue[] dialogues)
    {
        foreach(var dialogue in dialogues ?? Array.Empty<GameplayDialogue>())
            if(dialogue != null && !string.IsNullOrEmpty(dialogue.id) && dialogue.lines != null && dialogue.lines.Length > 0)
                blocks[dialogue.id] = dialogue;
    }
    public bool Open(string id)
    {
        if(string.IsNullOrEmpty(id) || !blocks.TryGetValue(id, out var block)) return false;
        current = block; index = 0; return true;
    }
    public bool Advance()
    {
        if(!IsOpen || (Line.choices != null && Line.choices.Length > 0)) return false;
        if(++index >= current.lines.Length) Close();
        return true;
    }
    public bool Choose(int choiceIndex, Func<string,bool> action)
    {
        var choices = Line?.choices;
        if(choices == null || choiceIndex < 0 || choiceIndex >= choices.Length) return false;
        var choice = choices[choiceIndex];
        if(choice == null || (!string.IsNullOrEmpty(choice.nextDialogueId) && !blocks.ContainsKey(choice.nextDialogueId))) return false;
        if(!string.IsNullOrEmpty(choice.action) && (action == null || !action(choice.action))) return false;
        if(!string.IsNullOrEmpty(choice.nextDialogueId)) return Open(choice.nextDialogueId);
        if(choice.end) Close();
        else if(++index >= current.lines.Length) Close();
        return true;
    }
    public void Close() { current = null; index = 0; }
}
