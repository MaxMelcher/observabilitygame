using Azure;
using Azure.AI.OpenAI;
using backend.Data;
using backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using OpenAI.Chat;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Observability Game API", Version = "v1" });
});
builder.Services.AddApplicationInsightsTelemetry();
builder.Services.AddCors();

// Add database context
builder.Services.AddDbContext<GameDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

// Add Azure OpenAI client
builder.Services.AddSingleton(new AzureOpenAIClient(
    new Uri(builder.Configuration["AzureOpenAI:Endpoint"]!),
    new AzureKeyCredential(builder.Configuration["AzureOpenAI:ApiKey"]!)
));

builder.Services.AddHealthChecks();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHttpsRedirection();
}
app.UseCors(builder => builder
    .AllowAnyOrigin()
    .AllowAnyMethod()
    .AllowAnyHeader());

// Get top scores
app.MapGet("/api/scores", async (GameDbContext db) =>
{
    return await db.PlayerScores
        .OrderBy(s => s.Time)
        .Take(10)
        .ToListAsync();
})
.WithName("GetTopScores");

//add healthcheck
app.MapHealthChecks("/health");

// Submit new score
app.MapPost("/api/scores", async (GameDbContext db, AzureOpenAIClient openAI, PlayerScore score, ILogger<Program> logger) =>
{
    try
    {
        if (score.PlayerName == "crash")
        {
            throw new Exception("GAME SERVER CRASHED!");
        }
        if (score.PlayerName == "timeout")
        {
            Thread.Sleep(90000);
            throw new Exception("GAME SERVER TIMEOUT!");
        }

        //validate that the player name is not profane
        var profaneCheckPrompt = $"The following is a player name submitted to a game. Determine if it contains any inappropriate, offensive, profane, harmful, or unsafe content, including insults, hate speech, email addresses, or anything unsuitable for children. Answer strictly with 'yes' or 'no'";
        var chatClient = openAI.GetChatClient("gpt-4o");
        ChatCompletion completion = chatClient.CompleteChat(
            [
                new SystemChatMessage(profaneCheckPrompt),
                new UserChatMessage($"{score.PlayerName}"),
            ]);

        var result = completion.Content[0].Text;

        if (result.ToLower().Contains("yes"))
        {
            logger.LogWarning("Invalid player name attempt: {PlayerName}", score.PlayerName);
            return Results.BadRequest("invalid player name");
        }

        score.Created = DateTime.UtcNow;
        db.PlayerScores.Add(score);
        await db.SaveChangesAsync();

        return Results.Created($"/api/scores/{score.Id}", score);
    }
    catch (Exception ex)
    {
        logger.LogError(ex, "Error processing score submission");
        return Results.StatusCode(500);
    }
})
.WithName("SubmitScore");

app.Run();
