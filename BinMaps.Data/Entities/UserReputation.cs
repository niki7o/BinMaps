using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace BinMaps.Data.Entities
{
    public  class UserReputation
    {
        [Key] 
        public string UserId { get; set; }
        public int Points { get; set;  } = 0;
    }
}
