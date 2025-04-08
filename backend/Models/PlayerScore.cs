namespace backend.Models;

public class PlayerScore
{
    public int Id { get; set; }
    public string PlayerName { get; set; } = string.Empty;
    public TimeSpan Time { get; set; }
    public DateTime Created { get; set; }
}