using BinMaps.Data;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;
namespace BinMaps.Infrastructure.Repository;
public sealed class Repository<TType, TId> : IRepository<TType, TId> where TType : class
{
    private readonly BinMapsDbContext _context;
    private readonly DbSet<TType> _set;

    public Repository(BinMapsDbContext context)
    {
        _context = context;
        _set = context.Set<TType>();
    }

    #region Read

    public async Task<TType?> GetByIdAsync(TId id) => await _set.FindAsync(id);

    public async Task<TType?> FirstOrDefaultAsync(Expression<Func<TType, bool>> predicate)
        => await _set.FirstOrDefaultAsync(predicate);

    public IQueryable<TType> GetAllAttached() => _set.AsQueryable();

    public async Task<IEnumerable<TType>> GetAllAsync() => await _set.ToArrayAsync();

    #endregion

    #region Write

    public async Task AddAsync(TType item)
    {
        await _set.AddAsync(item);
        await _context.SaveChangesAsync();
    }

    public async Task AddRangeAsync(TType[] items)
    {
        await _set.AddRangeAsync(items);
        await _context.SaveChangesAsync();
    }

    public async Task<bool> UpdateAsync(TType item)
    {
        _context.Entry(item).State = EntityState.Modified;
        return await _context.SaveChangesAsync() > 0;
    }

    public async Task<bool> DeleteAsync(TType entity)
    {
        _set.Remove(entity);
        return await _context.SaveChangesAsync() > 0;
    }

    #endregion
}