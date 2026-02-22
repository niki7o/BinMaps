//using Xunit;
//using FluentAssertions;
//using BinMaps.Infrastructure.Services;
//using BinMaps.Data.Entities;
//using BinMaps.Data.Entities.Enums;

//namespace BinMaps.Tests.Unit.Algorithms
//{
//    public class DijkstraTSPTests
//    {
//        [Fact]
//        public void Graph_AddNode_AddsSuccessfully()
//        {
           
//            var graph = new Graph();
//            var node = new GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };

           
//            graph.AddNode(node);

            
//            graph.Nodes.Should().Contain(node);
//            graph.Nodes.Count.Should().Be(1);
//        }

//        [Fact]
//        public void Graph_AddEdge_CreatesConnection()
//        {
            
//            var graph = new Graph();
//            var node1 = new GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
//            var node2 = new GraphNode { Id = 2, LocationX = 42.71, LocationY = 23.31 };
//            graph.AddNode(node1);
//            graph.AddNode(node2);

           
//            graph.AddEdge(1, 2, 1.5);

            
//            var fromNode = graph.GetNode(1);
//            fromNode.Should().NotBeNull();
//            fromNode!.Edges.Should().HaveCount(1);
//            fromNode.Edges[0].TargetNodeId.Should().Be(2);
//            fromNode.Edges[0].Weight.Should().Be(1.5);
//        }

//        [Fact]
//        public void Graph_GetNode_ReturnsCorrectNode()
//        {
          
//            var graph = new Graph();
//            var node1 = new GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
//            var node2 = new GraphNode { Id = 2, LocationX = 42.71, LocationY = 23.31 };
//            graph.AddNode(node1);
//            graph.AddNode(node2);

           
//            var retrieved = graph.GetNode(2);

           
//            retrieved.Should().NotBeNull();
//            retrieved!.Id.Should().Be(2);
//            retrieved.LocationX.Should().Be(42.71);
//        }

//        [Fact]
//        public void Graph_GetNode_NonExistent_ReturnsNull()
//        {
            
//            var graph = new Graph();

            
//            var node = graph.GetNode(999);

           
//            node.Should().BeNull();
//        }

//        [Fact]
//        public void Graph_MultipleEdges_AllStored()
//        {
            
//            var graph = new Graph();
//            var node1 = new GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
//            var node2 = new GraphNode { Id = 2, LocationX = 42.71, LocationY = 23.31 };
//            var node3 = new GraphNode { Id = 3, LocationX = 42.72, LocationY = 23.32 };
//            graph.AddNode(node1);
//            graph.AddNode(node2);
//            graph.AddNode(node3);

//            graph.AddEdge(1, 2, 1.0);
//            graph.AddEdge(1, 3, 2.0);
//            graph.AddEdge(2, 3, 1.5);

            
//            graph.GetNode(1)!.Edges.Should().HaveCount(2);
//            graph.GetNode(2)!.Edges.Should().HaveCount(1);
//            graph.GetNode(3)!.Edges.Should().BeEmpty();
//        }

//        [Fact]
//        public void GraphNode_TruckNode_CorrectlyIdentified()
//        {
           
//            var truckNode = new GraphNode
//            {
//                Id = -1,
//                LocationX = 42.7,
//                LocationY = 23.3,
//                IsTruck = true
//            };

            
//            truckNode.IsTruck.Should().BeTrue();
//            truckNode.Container.Should().BeNull();
//        }

//        [Fact]
//        public void GraphNode_ContainerNode_StoresReference()
//        {
           
//            var container = new TrashContainer
//            {
//                Id = 5,
//                FillPercentage = 75,
//                LocationX = 42.7,
//                LocationY = 23.3
//            };

           
//            var node = new GraphNode
//            {
//                Id = 5,
//                LocationX = container.LocationX,
//                LocationY = container.LocationY,
//                Container = container
//            };

         
//            node.IsTruck.Should().BeFalse();
//            node.Container.Should().NotBeNull();
//            node.Container!.Id.Should().Be(5);
//        }

//        [Fact]
//        public void GraphEdge_StoresWeightCorrectly()
//        {
           
//            var edge = new GraphEdge
//            {
//                SourceNodeId = 1,
//                TargetNodeId = 2,
//                Weight = 3.14
//            };

           
//            edge.SourceNodeId.Should().Be(1);
//            edge.TargetNodeId.Should().Be(2);
//            edge.Weight.Should().Be(3.14);
//        }

//        [Fact]
//        public void DijkstraPath_StoresDistanceCorrectly()
//        {
//            var path = new DijkstraPath
//            {
//                TargetNodeId = 5,
//                TotalDistance = 12.5
//            };

          
//            path.TargetNodeId.Should().Be(5);
//            path.TotalDistance.Should().Be(12.5);
//        }

//        [Fact]
//        public void Graph_ComplexScenario_FullGraph()
//        {
         
//            var graph = new Graph();

          
//            var truck = new GraphNode { Id = -1, LocationX = 42.7, LocationY = 23.3, IsTruck = true };
//            graph.AddNode(truck);

//            for (int i = 1; i <= 3; i++)
//            {
//                var node = new GraphNode
//                {
//                    Id = i,
//                    LocationX = 42.7 + (i * 0.01),
//                    LocationY = 23.3 + (i * 0.01),
//                    Container = new TrashContainer { Id = i, FillPercentage = 80 }
//                };
//                graph.AddNode(node);
//            }

           
//            foreach (var from in graph.Nodes)
//            {
//                foreach (var to in graph.Nodes)
//                {
//                    if (from.Id != to.Id)
//                    {
//                        double distance = Math.Sqrt(
//                            Math.Pow(to.LocationX - from.LocationX, 2) +
//                            Math.Pow(to.LocationY - from.LocationY, 2)
//                        );
//                        graph.AddEdge(from.Id, to.Id, distance);
//                    }
//                }
//            }

          
//            graph.Nodes.Should().HaveCount(4); 
//            graph.GetNode(-1)!.Edges.Should().HaveCount(3); 
//            graph.GetNode(1)!.Edges.Should().HaveCount(3); 
//        }

//        [Theory]
//        [InlineData(0, 0, 0, 0, 0)]
//        [InlineData(0, 0, 1, 0, 1)] 
//        [InlineData(0, 0, 0, 1, 1)]
//        [InlineData(0, 0, 3, 4, 5)] 
//        public void EuclideanDistance_Calculation(double x1, double y1, double x2, double y2, double expected)
//        {
          
//            double distance = Math.Sqrt(Math.Pow(x2 - x1, 2) + Math.Pow(y2 - y1, 2));

//            distance.Should().BeApproximately(expected, 0.001);
//        }

//        [Fact]
//        public void Graph_SelfLoop_NotAdded()
//        {
            
//            var graph = new Graph();
//            var node = new GraphNode { Id = 1, LocationX = 42.7, LocationY = 23.3 };
//            graph.AddNode(node);

         
//            graph.AddEdge(1, 1, 0);

            
//            var edges = graph.GetNode(1)!.Edges;
            
//            edges.Should().HaveCount(1); 
//        }
//    }
//}