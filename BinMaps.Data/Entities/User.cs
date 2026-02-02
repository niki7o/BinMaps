
using Microsoft.AspNetCore.Identity;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text;

namespace BinMaps.Data.Entities
{
    public class User: IdentityUser
    {

        public int Reputation { get; set;  } = 0;
    }
}
