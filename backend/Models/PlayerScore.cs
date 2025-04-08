using System.Text.Json.Serialization;

namespace backend.Models;

public class PlayerScore
{
    public int Id { get; set; }
    public string PlayerName { get; set; } = string.Empty;
    public double Time { get; set; }  // time in milliseconds
    public DateTime Created { get; set; }
    public string Hash { get; set; } = string.Empty;
}